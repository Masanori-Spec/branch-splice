#!/usr/bin/env python3
"""Independent provenance audit of a BranchSplice output and its exact inputs.

Uses only Python's standard library and actual archive bytes. It does not import
product code or the frozen content oracle. Run that oracle separately. A PASS
here does not prove UI execution, native compatibility, or screenshot review.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import uuid
import zipfile

LIMIT = 256 * 1024 * 1024
ALLOWED_TYPES = {'H5P.AdvancedText 1.1', 'H5P.Image 1.1', 'H5P.BranchingQuestion 1.0'}

class ProvenanceError(ValueError):
    pass

def digest(data):
    return hashlib.sha256(data).hexdigest()

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')

def object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProvenanceError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result

def json_read(data):
    def nonfinite(value):
        raise ProvenanceError(f'Nonfinite JSON number: {value}')
    return json.loads(data, object_pairs_hook=object_pairs, parse_constant=nonfinite)

def safe_path(name):
    if not isinstance(name, str) or not name or any(c in name for c in '\\\x00?#:'):
        raise ProvenanceError(f'Unsafe archive/reference path: {name!r}')
    if name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/')) or str(PurePosixPath(name)) != name:
        raise ProvenanceError(f'Noncanonical archive/reference path: {name!r}')
    return name

class Audit:
    def __init__(self):
        self.checks = []
    def check(self, ok, label):
        if not ok:
            raise ProvenanceError(label)
        self.checks.append(label)
    def equal(self, actual, expected, label):
        self.check(canonical(actual) == canonical(expected), label)

def read_archive(path):
    path = Path(path)
    raw = path.read_bytes()
    entries, seen, total = {}, set(), 0
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            name = safe_path(info.filename.rstrip('/') if info.is_dir() else info.filename)
            if name in seen:
                raise ProvenanceError(f'Duplicate ZIP entry: {name}')
            seen.add(name)
            if info.flag_bits & 1:
                raise ProvenanceError(f'Encrypted ZIP entry: {name}')
            if ((info.external_attr >> 16) & 0o170000) == 0o120000:
                raise ProvenanceError(f'Symlink ZIP entry: {name}')
            total += info.file_size
            if total > LIMIT:
                raise ProvenanceError('Archive exceeds bounded uncompressed size')
            if not info.is_dir():
                entries[name] = archive.read(info)
    return {'path': path, 'raw': raw, 'entries': entries,
            'content': json_read(entries['content/content.json']),
            'metadata': json_read(entries['h5p.json'])}

def resolve(obj, pointer):
    if not isinstance(pointer, str) or not pointer.startswith('/'):
        raise ProvenanceError(f'Invalid JSON pointer: {pointer!r}')
    for key in pointer[1:].split('/'):
        key = key.replace('~1', '/').replace('~0', '~')
        obj = obj[int(key)] if isinstance(obj, list) else obj[key]
    return obj

def dep_key(dep):
    return dep['machineName'], dep['majorVersion'], dep['minorVersion']

def library_folder(dep):
    return f"{dep['machineName']}-{dep['majorVersion']}.{dep['minorVersion']}"

def targets(node):
    if node['type']['library'] == 'H5P.BranchingQuestion 1.0':
        return [(i, a.get('nextContentId', -1), a['text']) for i, a in enumerate(node['type']['params']['branchingQuestion']['alternatives'])]
    return [(None, node.get('nextContentId', -1), None)]

def set_target(node, alternative, target):
    if alternative is None:
        node['nextContentId'] = target
    else:
        node['type']['params']['branchingQuestion']['alternatives'][alternative]['nextContentId'] = target

def compute_routes(nodes, audit, limit):
    result = []
    def visit(index, path, choices):
        audit.check(index not in path, f'Forward graph is acyclic at node {index}')
        path = path + [index]
        for alternative, target, label in targets(nodes[index]):
            audit.check(type(target) is int and (target == -1 or 0 <= target < len(nodes)), f'Actual target valid at node {index}/{alternative}')
            selected = choices + ([] if alternative is None else [{'node': index, 'alternative': alternative, 'label': label}])
            if target == -1:
                holder = nodes[index] if alternative is None else nodes[index]['type']['params']['branchingQuestion']['alternatives'][alternative]
                feedback = holder.get('feedback', {})
                custom = bool(feedback.get('title', '').strip() or feedback.get('subtitle', '').strip() or feedback.get('image') or 'endScreenScore' in feedback)
                result.append({'nodes': path, 'choices': selected, 'ending': {'node': index, 'alternative': alternative, 'customFeedback': custom, 'feedback': feedback}})
                audit.check(len(result) <= limit, 'Actual forward routes within bounded limit')
            else:
                visit(target, path, selected)
    visit(0, [], [])
    audit.check({n for route in result for n in route['nodes']} == set(range(len(nodes))), 'All actual output nodes reachable')
    return result

def verify(output_path, manifest_path, source_paths, text_report_path=None):
    audit = Audit()
    manifest_path = Path(manifest_path)
    manifest_bytes = manifest_path.read_bytes()
    m = json_read(manifest_bytes)
    output = read_archive(output_path)
    audit.check(isinstance(m['inputs'], list) and len(m['inputs']) == 3 and len(source_paths) == 3, 'Exactly three ordered input records and supplied source archives')
    module_ids = [record['id'] for record in m['inputs']]
    audit.check(all(isinstance(mid, str) and 0 < len(mid) <= 128 and mid.strip() == mid and not any(ord(c) < 32 or ord(c) == 127 for c in mid) for mid in module_ids), 'Input module IDs are nonempty bounded control-free strings')
    audit.check(len(set(module_ids)) == 3, 'Input module IDs are distinct')
    host_id = module_ids[0]
    sources = {name: read_archive(path) for name, path in zip(module_ids, source_paths)}
    audit.equal(m['schemaVersion'], 1, 'Manifest schema version')
    audit.equal(m['hostModule'], host_id, 'Host module is first supplied source archive')
    offsets, expected_order, source_ids = {}, [], set()
    for record in m['inputs']:
        mid = record['id']; src = sources[mid]
        source_nodes = src['content']['branchingScenario']['content']
        offsets[mid] = len(expected_order)
        expected_order.extend((mid, i) for i in range(len(source_nodes)))
        source_ids.update(n['type']['subContentId'] for n in source_nodes)
        audit.equal(record['filename'], src['path'].name, f'{mid} input filename')
        audit.equal(record['sha256'], digest(src['raw']), f'{mid} input archive SHA-256')
        audit.equal(record['sizeBytes'], len(src['raw']), f'{mid} input archive byte count')
        audit.equal(record['nodeCount'], len(source_nodes), f'{mid} input node count')
        audit.equal(record['metadata'], src['metadata'], f'{mid} full input metadata snapshot')
        audit.equal(record['title'], src['metadata']['title'], f'{mid} input title')
    audit.equal(m['moduleOffsets'], offsets, 'Module offsets match actual source node counts')
    audit.equal(m['output']['sha256'], digest(output['raw']), 'Output archive SHA-256')
    audit.equal(m['output']['sizeBytes'], len(output['raw']), 'Output archive byte count')
    audit.equal(m['output']['contentJsonSha256'], digest(output['entries']['content/content.json']), 'Output content JSON raw-byte SHA-256')
    outnodes = output['content']['branchingScenario']['content']
    audit.equal(len(outnodes), len(expected_order), 'Output contains exactly all appended source nodes, no clones')
    audit.equal(len(m['nodeMappings']), len(expected_order), 'Exactly one mapping for every source node')
    expected_nodes = []
    output_ids = set()
    for outindex, ((mid, source_index), mapping, actual) in enumerate(zip(expected_order, m['nodeMappings'], outnodes)):
        original = sources[mid]['content']['branchingScenario']['content'][source_index]
        expected = copy.deepcopy(original)
        label = f'Node {outindex}'
        audit.equal([mapping['moduleId'], mapping['sourceNode'], mapping['outputNode']], [mid, source_index, outindex], label + ' mapping source/destination')
        audit.check(original['type']['library'] in ALLOWED_TYPES, label + ' supported source type')
        audit.equal(mapping['library'], original['type']['library'], label + ' declared library')
        audit.equal(mapping['sourceNodeSha256'], digest(canonical(original)), label + ' canonical source hash')
        audit.equal(mapping['outputNodeSha256'], digest(canonical(actual)), label + ' canonical output hash')
        old_id, new_id = original['type']['subContentId'], actual['type']['subContentId']
        audit.equal([mapping['oldSubContentId'], mapping['newSubContentId']], [old_id, new_id], label + ' old/new IDs')
        audit.check(new_id not in output_ids, label + ' unique output UUID')
        output_ids.add(new_id)
        if mid == host_id:
            audit.equal(new_id, old_id, label + ' host UUID preserved')
            audit.equal(mapping['regenerated'], False, label + ' host regeneration flag')
        else:
            parsed = uuid.UUID(new_id)
            audit.check(parsed.version == 4 and parsed.variant == uuid.RFC_4122 and str(parsed) == new_id, label + ' canonical fresh UUIDv4')
            audit.check(new_id not in source_ids, label + ' donor UUID fresh against every source UUID')
            audit.equal(mapping['regenerated'], True, label + ' donor regeneration flag')
        expected['type']['subContentId'] = new_id
        for alternative, target, _ in targets(original):
            audit.check(type(target) is int and (target == -1 or 0 <= target < len(sources[mid]['content']['branchingScenario']['content'])), label + ' original target valid')
            # Preserve absence of a default -1 field unless a declared connection adds it.
            if target >= 0:
                set_target(expected, alternative, offsets[mid] + target)
        expected_nodes.append(expected)
    used_connections = set()
    for index, connection in enumerate(m['connections']):
        mid, si, alternative = connection['fromModule'], connection['fromNode'], connection['alternative']
        target_mid, target_si = connection['toModule'], connection['toNode']
        audit.check(mid in module_ids and target_mid in module_ids, f'Connection {index} known modules')
        srcnodes = sources[mid]['content']['branchingScenario']['content']
        dstnodes = sources[target_mid]['content']['branchingScenario']['content']
        audit.check(type(si) is int and 0 <= si < len(srcnodes) and type(target_si) is int and 0 <= target_si < len(dstnodes), f'Connection {index} source/destination in bounds')
        audit.check(alternative is None or type(alternative) is int, f'Connection {index} alternative is null or an integer')
        key = (mid, si, alternative)
        audit.check(key not in used_connections, f'Connection {index} unique source slot'); used_connections.add(key)
        choices = {a: target for a, target, _ in targets(srcnodes[si])}
        audit.check(alternative in choices and choices[alternative] == -1, f'Connection {index} replaces an actual source terminal')
        from_index, to_index = offsets[mid] + si, offsets[target_mid] + target_si
        audit.equal([connection['outputFromNode'], connection['outputToNode']], [from_index, to_index], f'Connection {index} declared output mapping')
        set_target(expected_nodes[from_index], alternative, to_index)
    typed_references = {}
    for mid, src in sources.items():
        for i, node in enumerate(src['content']['branchingScenario']['content']):
            if node['type']['library'] == 'H5P.Image 1.1':
                file = node['type']['params']['file']
                path = safe_path(file['path'])
                pointer = f'/branchingScenario/content/{i}/type/params/file/path'
                typed_references[(mid, pointer)] = (path, offsets[mid] + i, file)
    seen_references, mapped_files, source_assets, output_paths = set(), set(), set(), set()
    asset_observations = []
    for index, asset in enumerate(m['assetMappings']):
        mid = asset['moduleId']; before_path = safe_path(asset['sourcePath']); after_path = safe_path(asset['outputPath'])
        label = f'Asset {index} ({mid})'
        audit.check(mid in module_ids, label + ' known source module')
        asset_key = (mid, before_path)
        audit.check(asset_key not in source_assets, label + ' unique source file mapping'); source_assets.add(asset_key)
        before = sources[mid]['entries']['content/' + before_path]
        after = output['entries']['content/' + after_path]
        audit.check(before == after, label + ' exact source/output bytes preserved')
        audit.equal(asset['sha256'], digest(before), label + ' image-byte SHA-256')
        audit.equal(asset['renamed'], before_path != after_path, label + ' rename flag')
        audit.equal(asset['reason'], 'collision-renamed' if before_path != after_path else 'unchanged', label + ' bounded rename reason')
        audit.check(isinstance(asset['references'], list) and len(asset['references']) > 0, label + ' nonempty reference list')
        for reference in asset['references']:
            refkey = (mid, reference['sourcePointer'])
            audit.check(refkey in typed_references and refkey not in seen_references, label + ' genuine unique typed-image source pointer')
            seen_references.add(refkey)
            expected_path, outindex, source_file = typed_references[refkey]
            audit.equal(before_path, expected_path, label + ' source path matches typed field')
            audit.equal(reference['outputPointer'], f'/branchingScenario/content/{outindex}/type/params/file/path', label + ' exact mapped typed-image output pointer')
            audit.equal(resolve(sources[mid]['content'], reference['sourcePointer']), before_path, label + ' source pointer resolves')
            audit.equal(resolve(output['content'], reference['outputPointer']), after_path, label + ' output pointer resolves')
            for field in ('mime', 'width', 'height'):
                audit.equal(asset.get(field), source_file.get(field), label + ' declared ' + field)
            expected_nodes[outindex]['type']['params']['file']['path'] = after_path
        if after_path in output_paths:
            audit.check(all(a['sha256'] == asset['sha256'] for a in asset_observations if a['outputPath'] == after_path), label + ' aliases only byte-identical media')
        output_paths.add(after_path); mapped_files.add('content/' + after_path)
        asset_observations.append({'moduleId': mid, 'sourcePath': before_path, 'outputPath': after_path, 'sha256': digest(after)})
    audit.equal(sorted(seen_references), sorted(typed_references), 'Every actual typed source image accounted for exactly once')
    for mid, src in sources.items():
        files = {p for p in src['entries'] if p.startswith('content/') and p != 'content/content.json'}
        audit.equal(sorted(files), sorted('content/' + p for m_id, p in source_assets if m_id == mid), mid + ' all source content asset files accounted for')
    audit.equal(sorted(p for p in output['entries'] if p.startswith('content/') and p != 'content/content.json'), sorted(mapped_files), 'No dropped or undeclared output content assets')
    for i, (expected, actual) in enumerate(zip(expected_nodes, outnodes)):
        audit.equal(actual, expected, f'Node {i} complete structure: only declared graph, UUID and typed-image-path changes')
    host = sources[host_id]
    expected_content = copy.deepcopy(host['content'])
    expected_content['branchingScenario']['content'] = expected_nodes
    audit.equal(output['content'], expected_content, 'Full output content and host globals unchanged except declared node transformations')
    for key in ('startScreen', 'endScreens', 'behaviour', 'l10n'):
        audit.equal(m['retainedHostSettings'][key], host['content']['branchingScenario'][key], 'Host ' + key + ' retained-settings snapshot')
    audit.equal(m['retainedHostSettings']['metadata'], host['metadata'], 'Full retained host metadata snapshot')
    expected_metadata = copy.deepcopy(host['metadata'])
    dependencies, dep_seen = [], set()
    for src in sources.values():
        for dep in src['metadata']['preloadedDependencies']:
            key = dep_key(dep)
            if key not in dep_seen:
                dependencies.append(copy.deepcopy(dep)); dep_seen.add(key)
    expected_metadata['preloadedDependencies'] = dependencies
    audit.equal(output['metadata'], expected_metadata, 'Full output package metadata preserved with exact ordered dependency union')
    # Every non-content archive byte must be the exact unmodified union of inputs.
    library_union = {}
    for mid, src in sources.items():
        for name, data in src['entries'].items():
            if name == 'h5p.json' or name.startswith('content/'):
                continue
            if name in library_union:
                audit.check(library_union[name] == data, f'Input library byte agreement: {mid}/{name}')
            library_union[name] = data
    actual_library = {n: b for n, b in output['entries'].items() if n != 'h5p.json' and not n.startswith('content/')}
    audit.equal(sorted(actual_library), sorted(library_union), 'Exact library/resource file union, no dropped/extra files')
    for name, data in library_union.items():
        audit.check(actual_library[name] == data, 'Unmodified library/resource bytes: ' + name)
    declarations = {}
    for name, data in actual_library.items():
        if name.count('/') == 1 and name.endswith('/library.json'):
            library = json_read(data)
            folder = name.split('/')[0]
            audit.equal(folder, library_folder(library), 'Library declaration matches folder: ' + folder)
            declarations[folder] = library
    for dep in dependencies:
        audit.check(library_folder(dep) in declarations, 'Package dependency exists: ' + library_folder(dep))
    for folder, library in declarations.items():
        for category in ('preloadedDependencies', 'dynamicDependencies', 'editorDependencies'):
            for dep in library.get(category, []):
                audit.check(library_folder(dep) in declarations, f'Library dependency closure: {folder}/{category}/{library_folder(dep)}')
        for category in ('preloadedJs', 'preloadedCss'):
            for resource in library.get(category, []):
                name = folder + '/' + safe_path(resource['path'])
                audit.check(name in actual_library, 'Declared library resource exists: ' + name)
    route_limit = m['scope']['maximumRoutes']
    audit.check(type(route_limit) is int and 0 < route_limit <= 512, 'Declared route limit within bounded profile')
    routes = compute_routes(outnodes, audit, route_limit)
    audit.equal(m['routes'], routes, 'Manifest route nodes, choices, endings and feedback match actual archive')
    audit.equal(m['summary'], {'moduleCount': 3, 'nodeCount': len(outnodes), 'routeCount': len(routes), 'assetCount': len(output_paths), 'renamedAssetCount': sum(a['renamed'] for a in m['assetMappings'])}, 'All summary counts match independently observed data')
    if text_report_path is not None:
        text = Path(text_report_path).read_text(encoding='utf-8')
        required = ['BranchSplice connection report', 'Profile: ' + m['profile'], 'Host: ' + host_id,
                    f'3 modules / {len(outnodes)} nodes / {len(routes)} complete routes',
                    f'{len(output_paths)} output image files / {sum(a["renamed"] for a in m["assetMappings"])} renamed source paths']
        for record in m['inputs']:
            required += [f'{record["id"]}: {record["filename"]}', '  SHA-256 ' + record['sha256']]
        for connection in m['connections']:
            src = f'{connection["fromModule"]} node {connection["fromNode"]}'
            if connection['alternative'] is not None:
                raise ProvenanceError('Text-report audit currently supports the supplied scalar-terminal connection fixtures only')
            required.append(f'{src} -> {connection["toModule"]} entry {connection["toNode"]} (output {connection["outputFromNode"]} -> {connection["outputToNode"]})')
        for asset in m['assetMappings']:
            required += [f'{asset["moduleId"]}: {asset["sourcePath"]} -> {asset["outputPath"]}', f'  SHA-256 {asset["sha256"]} ({asset["reason"]})']
        for i, route in enumerate(routes, 1):
            required += [f'{i}. ' + ' -> '.join(map(str, route['nodes'])) + ' -> END', '   Choices: ' + ' / '.join(c['label'] for c in route['choices'])]
        required += ['Output SHA-256 ' + digest(output['raw'])]
        lines = text.splitlines()
        for line in required:
            audit.check(line in lines, 'Text report exact line: ' + line)
        audit.check('not a live native-player test of this individual export' in text, 'Text report retains native-execution limitation')
    return {'status': 'PASS', 'scope': 'Independent archive/provenance consistency only; frozen graph/content oracle and native/UI checks are separate',
            'output_archive': str(Path(output_path)), 'output_sha256': digest(output['raw']),
            'manifest_sha256': digest(manifest_bytes),
            'input_sha256': {mid: digest(src['raw']) for mid, src in sources.items()},
            'node_count': len(outnodes), 'route_count': len(routes), 'image_files': len(output_paths),
            'library_resource_files': len(library_union), 'library_declarations': len(declarations),
            'node_hash_encoding': 'Recursively key-sorted, compact UTF-8 JSON',
            'text_report_checked': text_report_path is not None, 'assertion_count': len(audit.checks),
            'assertions': audit.checks, 'native_ui_execution': 'NOT_RUN_BY_THIS_CHECKER'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--source-a', type=Path, required=True)
    parser.add_argument('--source-b', type=Path, required=True)
    parser.add_argument('--source-c', type=Path, required=True)
    parser.add_argument('--text-report', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    try:
        result = verify(args.output, args.manifest, [args.source_a, args.source_b, args.source_c], args.text_report)
        code = 0
    except (ProvenanceError, OSError, ValueError, KeyError, TypeError, IndexError, zipfile.BadZipFile, RuntimeError) as error:
        result = {'status': 'FAIL', 'reason': str(error), 'native_ui_execution': 'NOT_RUN_BY_THIS_CHECKER'}
        code = 1
    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered + '\n', encoding='utf-8')
    # Keep CI logs small; the optional report includes every asserted library file.
    print(json.dumps({k: v for k, v in result.items() if k != 'assertions'}, indent=2, ensure_ascii=False))
    return code

if __name__ == '__main__':
    raise SystemExit(main())
