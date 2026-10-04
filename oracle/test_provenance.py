"""Standalone provenance-checker tests with synthetic fixtures, not native proof."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import uuid
import zipfile

from verify_provenance import ProvenanceError, canonical, verify


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_zip(path, entries):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)


def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2).encode()


def fixture(directory, missing_dependency=False):
    root = Path(directory)
    libs = {}
    for name, minor in [('H5P.BranchingScenario', 8), ('H5P.AdvancedText', 1), ('H5P.Image', 1)]:
        declaration = {'machineName': name, 'majorVersion': 1, 'minorVersion': minor, 'patchVersion': 0, 'preloadedJs': [{'path': 'runtime.js'}]}
        if missing_dependency and name == 'H5P.Image':
            declaration['editorDependencies'] = [{'machineName': 'Missing.Editor', 'majorVersion': 1, 'minorVersion': 0}]
        libs[f'{name}-1.{minor}/library.json'] = encode(declaration)
        libs[f'{name}-1.{minor}/runtime.js'] = b'// synthetic checker test resource only\n'
    content_list, metadata_list, source_entries, source_paths = [], [], [], []
    deps = [{'machineName': n, 'majorVersion': 1, 'minorVersion': minor} for n, minor in [('H5P.BranchingScenario', 8), ('H5P.AdvancedText', 1), ('H5P.Image', 1)]]
    for module_index, letter in enumerate('ABC'):
        nodes = []
        for i in range(2):
            image = module_index > 0 and i == 0
            params = {'file': {'path': 'images/map.png', 'mime': 'image/png', 'width': 1, 'height': 1}, 'alt': letter + ' image'} if image else {'text': f'<p>{letter}{i} original text</p>'}
            nodes.append({'type': {'library': 'H5P.Image 1.1' if image else 'H5P.AdvancedText 1.1', 'params': params,
                                  'subContentId': str(uuid.UUID(int=module_index * 10 + i + 1, version=4)),
                                  'metadata': {'title': f'{letter}{i}', 'license': 'U', 'authors': [], 'changes': []}},
                          'feedback': {'title': '', 'subtitle': ''}, 'showContentTitle': False,
                          'nextContentId': 1 if i == 0 else -1})
        content = {'branchingScenario': {'content': nodes, 'startScreen': {'startScreenTitle': '<p>Start</p>'},
                 'endScreens': [{'contentId': -1, 'endScreenTitle': '<p>End</p>', 'endScreenSubtitle': '<p>Done</p>'}],
                 'behaviour': {'randomizeBranchingQuestions': False}, 'l10n': {'startScreenButtonText': 'Start'},
                 'scoringOptionGroup': {'scoringOption': 'no-score'}}}
        metadata = {'title': letter, 'extraTitle': letter, 'mainLibrary': 'H5P.BranchingScenario', 'license': 'U', 'preloadedDependencies': deps}
        entries = {**libs, 'h5p.json': encode(metadata), 'content/content.json': encode(content)}
        if module_index:
            entries['content/images/map.png'] = b'\x89PNG\r\n\x1a\nsynthetic-image-' + letter.encode()
        path = root / f'module-{letter}.h5p'; write_zip(path, entries)
        content_list.append(content); metadata_list.append(metadata); source_entries.append(entries); source_paths.append(path)
    out = copy.deepcopy(content_list[0]); outnodes = []
    for mid, content in enumerate(content_list):
        for i, node in enumerate(content['branchingScenario']['content']):
            node = copy.deepcopy(node)
            if mid:
                node['type']['subContentId'] = str(uuid.UUID(int=100 + mid * 10 + i, version=4))
            if node['nextContentId'] >= 0:
                node['nextContentId'] += mid * 2
            outnodes.append(node)
    outnodes[1]['nextContentId'] = 2; outnodes[3]['nextContentId'] = 4
    outnodes[4]['type']['params']['file']['path'] = 'images/room.png'
    out['branchingScenario']['content'] = outnodes
    output_entries = {**libs, 'h5p.json': encode(metadata_list[0]), 'content/content.json': encode(out),
                      'content/images/map.png': source_entries[1]['content/images/map.png'],
                      'content/images/room.png': source_entries[2]['content/images/map.png']}
    output_path = root / 'output.h5p'; write_zip(output_path, output_entries)
    manifest = {'schemaVersion': 1, 'profile': 'synthetic-provenance-test', 'scope': {'maximumRoutes': 512},
                'hostModule': 'M1', 'inputs': [], 'moduleOffsets': {'M1': 0, 'M2': 2, 'M3': 4}, 'nodeMappings': [], 'assetMappings': [],
                'connections': [{'fromModule': 'M1', 'fromNode': 1, 'alternative': None, 'toModule': 'M2', 'toNode': 0, 'outputFromNode': 1, 'outputToNode': 2},
                                {'fromModule': 'M2', 'fromNode': 1, 'alternative': None, 'toModule': 'M3', 'toNode': 0, 'outputFromNode': 3, 'outputToNode': 4}],
                'retainedHostSettings': {key: copy.deepcopy(content_list[0]['branchingScenario'][key]) for key in ('startScreen', 'endScreens', 'behaviour', 'l10n')},
                'routes': [{'nodes': [0, 1, 2, 3, 4, 5], 'choices': [], 'ending': {'node': 5, 'alternative': None, 'customFeedback': False, 'feedback': {'title': '', 'subtitle': ''}}}],
                'summary': {'moduleCount': 3, 'nodeCount': 6, 'routeCount': 1, 'assetCount': 2, 'renamedAssetCount': 1}}
    manifest['retainedHostSettings']['metadata'] = metadata_list[0]
    for mid, path in enumerate(source_paths):
        manifest['inputs'].append({'id': f'M{mid + 1}', 'filename': path.name, 'sha256': sha(path.read_bytes()), 'sizeBytes': path.stat().st_size, 'nodeCount': 2, 'metadata': metadata_list[mid], 'title': metadata_list[mid]['title']})
        for i, node in enumerate(content_list[mid]['branchingScenario']['content']):
            actual = outnodes[mid * 2 + i]
            manifest['nodeMappings'].append({'moduleId': f'M{mid + 1}', 'sourceNode': i, 'outputNode': mid * 2 + i,
                  'library': node['type']['library'], 'oldSubContentId': node['type']['subContentId'], 'newSubContentId': actual['type']['subContentId'],
                  'regenerated': mid > 0, 'sourceNodeSha256': sha(canonical(node)), 'outputNodeSha256': sha(canonical(actual))})
        if mid:
            path_after = 'images/map.png' if mid == 1 else 'images/room.png'
            manifest['assetMappings'].append({'moduleId': f'M{mid + 1}', 'sourcePath': 'images/map.png', 'outputPath': path_after,
                  'sha256': sha(source_entries[mid]['content/images/map.png']), 'mime': 'image/png', 'width': 1, 'height': 1,
                  'renamed': mid == 2, 'reason': 'collision-renamed' if mid == 2 else 'unchanged',
                  'references': [{'sourcePointer': '/branchingScenario/content/0/type/params/file/path', 'outputPointer': f'/branchingScenario/content/{mid * 2}/type/params/file/path'}]})
    manifest['output'] = {'sha256': sha(output_path.read_bytes()), 'sizeBytes': output_path.stat().st_size, 'contentJsonSha256': sha(output_entries['content/content.json'])}
    manifest_path = root / 'manifest.json'; manifest_path.write_bytes(encode(manifest))
    return {'root': root, 'sources': source_paths, 'output_path': output_path, 'manifest_path': manifest_path,
            'manifest': manifest, 'entries': output_entries, 'content': out}


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.f = fixture(self.temp.name)

    def audit(self):
        self.f['manifest_path'].write_bytes(encode(self.f['manifest']))
        return verify(self.f['output_path'], self.f['manifest_path'], self.f['sources'])

    def resign_output(self):
        self.f['entries']['content/content.json'] = encode(self.f['content'])
        write_zip(self.f['output_path'], self.f['entries'])
        m = self.f['manifest']; raw = self.f['output_path'].read_bytes()
        m['output'].update({'sha256': sha(raw), 'sizeBytes': len(raw), 'contentJsonSha256': sha(self.f['entries']['content/content.json'])})
        for i, mapping in enumerate(m['nodeMappings']):
            node = self.f['content']['branchingScenario']['content'][i]
            mapping['outputNodeSha256'] = sha(canonical(node)); mapping['newSubContentId'] = node['type']['subContentId']

    def test_synthetic_baseline(self):
        result = self.audit()
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['library_resource_files'], 6)
        self.assertEqual(result['native_ui_execution'], 'NOT_RUN_BY_THIS_CHECKER')

    def test_arbitrary_distinct_input_ids_in_source_order(self):
        m = self.f['manifest']; names = {'M1': 'input-7-1', 'M2': 'input-7-2', 'M3': 'input-7-3'}
        for record in m['inputs']: record['id'] = names[record['id']]
        m['hostModule'] = names[m['hostModule']]
        m['moduleOffsets'] = {names[key]: value for key, value in m['moduleOffsets'].items()}
        for mapping in m['nodeMappings'] + m['assetMappings']: mapping['moduleId'] = names[mapping['moduleId']]
        for connection in m['connections']:
            connection['fromModule'] = names[connection['fromModule']]
            connection['toModule'] = names[connection['toModule']]
        result = self.audit()
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(list(result['input_sha256']), list(names.values()))

    def test_manifest_cannot_swap_input_archive_associations(self):
        self.f['manifest']['inputs'][1], self.f['manifest']['inputs'][2] = self.f['manifest']['inputs'][2], self.f['manifest']['inputs'][1]
        with self.assertRaisesRegex(ProvenanceError, 'input filename|input archive SHA-256'): self.audit()

    def test_source_path_order_is_authoritative(self):
        self.f['sources'][1], self.f['sources'][2] = self.f['sources'][2], self.f['sources'][1]
        with self.assertRaisesRegex(ProvenanceError, 'input filename|input archive SHA-256'): self.audit()

    def test_duplicate_input_ids_rejected(self):
        self.f['manifest']['inputs'][1]['id'] = self.f['manifest']['inputs'][0]['id']
        with self.assertRaisesRegex(ProvenanceError, 'module IDs are distinct'): self.audit()

    def test_wrong_source_archive_hash(self):
        self.f['manifest']['inputs'][1]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ProvenanceError, 'input archive SHA-256'): self.audit()

    def test_wrong_output_hash(self):
        self.f['manifest']['output']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ProvenanceError, 'Output archive SHA-256'): self.audit()

    def test_forged_input_metadata(self):
        self.f['manifest']['inputs'][1]['metadata']['license'] = 'WRONG'
        with self.assertRaisesRegex(ProvenanceError, 'full input metadata'): self.audit()

    def test_host_uuid_changed_even_with_matching_hashes(self):
        self.f['content']['branchingScenario']['content'][0]['type']['subContentId'] = str(uuid.uuid4())
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'host UUID preserved'): self.audit()

    def test_donor_reuses_a_source_uuid(self):
        self.f['content']['branchingScenario']['content'][2]['type']['subContentId'] = self.f['manifest']['nodeMappings'][4]['oldSubContentId']
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'fresh against every source'): self.audit()

    def test_duplicate_output_uuid(self):
        nodes = self.f['content']['branchingScenario']['content']; nodes[3]['type']['subContentId'] = nodes[2]['type']['subContentId']
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'unique output UUID'): self.audit()

    def test_undeclared_text_change_even_with_matching_hashes(self):
        self.f['content']['branchingScenario']['content'][1]['type']['params']['text'] = '<p>Tampered</p>'
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'complete structure'): self.audit()

    def test_undeclared_metadata_change(self):
        self.f['content']['branchingScenario']['content'][3]['type']['metadata']['license'] = 'CC-BY'
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'complete structure'): self.audit()

    def test_undeclared_feedback_change(self):
        self.f['content']['branchingScenario']['content'][3]['feedback']['subtitle'] = 'Tampered'
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'complete structure'): self.audit()

    def test_undeclared_target_change(self):
        self.f['content']['branchingScenario']['content'][0]['nextContentId'] = 2
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'complete structure'): self.audit()

    def test_wrong_declared_connection_mapping(self):
        self.f['manifest']['connections'][0]['outputToNode'] = 4
        with self.assertRaisesRegex(ProvenanceError, 'declared output mapping'): self.audit()

    def test_duplicate_connection(self):
        self.f['manifest']['connections'].append(copy.deepcopy(self.f['manifest']['connections'][0]))
        with self.assertRaisesRegex(ProvenanceError, 'unique source slot'): self.audit()

    def test_global_change(self):
        self.f['content']['branchingScenario']['startScreen']['startScreenTitle'] = '<p>Tampered</p>'
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'Full output content'): self.audit()

    def test_package_metadata_change(self):
        meta = json.loads(self.f['entries']['h5p.json']); meta['license'] = 'CC-BY'
        self.f['entries']['h5p.json'] = encode(meta); self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'Full output package metadata'): self.audit()

    def test_wrong_media_bytes_even_with_matching_archive_hash(self):
        self.f['entries']['content/images/map.png'] = self.f['entries']['content/images/room.png']
        self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'exact source/output bytes'): self.audit()

    def test_untyped_asset_pointer(self):
        self.f['manifest']['assetMappings'][0]['references'][0]['sourcePointer'] = '/branchingScenario/content/1/type/params/text'
        with self.assertRaisesRegex(ProvenanceError, 'genuine unique typed-image'): self.audit()

    def test_wrong_image_dimensions(self):
        self.f['manifest']['assetMappings'][0]['width'] = 999
        with self.assertRaisesRegex(ProvenanceError, 'declared width'): self.audit()

    def test_extra_content_file(self):
        self.f['entries']['content/images/secret.txt'] = b'not declared'; self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'undeclared output content assets'): self.audit()

    def test_library_byte_tamper(self):
        self.f['entries']['H5P.Image-1.1/runtime.js'] = b'changed'; self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'Unmodified library/resource bytes'): self.audit()

    def test_missing_library_file(self):
        del self.f['entries']['H5P.Image-1.1/runtime.js']; self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'Exact library/resource file union'): self.audit()

    def test_extra_library_file(self):
        self.f['entries']['H5P.Image-1.1/extra.js'] = b'extra'; self.resign_output()
        with self.assertRaisesRegex(ProvenanceError, 'Exact library/resource file union'): self.audit()

    def test_missing_transitive_dependency(self):
        self.f = fixture(self.temp.name, missing_dependency=True)
        with self.assertRaisesRegex(ProvenanceError, 'Library dependency closure'): self.audit()

    def test_false_reported_route(self):
        self.f['manifest']['routes'][0]['nodes'] = [0, 2, 3, 4, 5]
        with self.assertRaisesRegex(ProvenanceError, 'Manifest route nodes'): self.audit()

    def test_false_summary(self):
        self.f['manifest']['summary']['routeCount'] = 9
        with self.assertRaisesRegex(ProvenanceError, 'summary counts'): self.audit()

    def test_wrong_text_report(self):
        path = self.f['root'] / 'wrong-report.txt'; path.write_text('A fake report\n')
        with self.assertRaisesRegex(ProvenanceError, 'Text report exact line'):
            verify(self.f['output_path'], self.f['manifest_path'], self.f['sources'], path)

    def test_duplicate_manifest_keys(self):
        data = self.f['manifest_path'].read_text(); self.f['manifest_path'].write_text('{"schemaVersion": 2,' + data[1:])
        with self.assertRaisesRegex(ProvenanceError, 'Duplicate JSON key'):
            verify(self.f['output_path'], self.f['manifest_path'], self.f['sources'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
