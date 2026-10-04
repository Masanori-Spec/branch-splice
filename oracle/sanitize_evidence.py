#!/usr/bin/env python3
"""Export only our fixture JSON plus hashes from a verified actual download.

Never writes upstream library bytes, H5P archives, traces or HTML snapshots.
The independent frozen oracle must pass before evidence is produced.
"""
import argparse, hashlib, json
from pathlib import Path
from verify_package import archive_entries, load_manifest, verify_archive
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('archive',type=Path)
p.add_argument('--case',required=True,choices=['module_a','module_b','module_c','first_splice','shared_c'])
p.add_argument('--native-edit',action='store_true')
p.add_argument('--report',required=True,type=Path)
a=p.parse_args()
verified=verify_archive(a.archive,load_manifest(),a.case,native_edit=a.native_edit)
entries=archive_entries(a.archive)
hash_bytes=lambda data:hashlib.sha256(data).hexdigest()
result={'schemaVersion':1,'kind':'sanitized-actual-download-evidence','case':a.case,'variant':verified['variant'],
 'actualArchiveSha256':hash_bytes(a.archive.read_bytes()),'actualArchiveBytes':a.archive.stat().st_size,
 'boundary':'Authored JSON and factual file-entry hashes only; no upstream code, library bytes, native archive or trace is included. A reconstructed ZIP may have different container headers/hash.',
 'oracle':verified,
 'authoredEntries':{name:{'utf8':entries[name].decode('utf-8'),'sha256':hash_bytes(entries[name])} for name in ['h5p.json','content/content.json']},
 'entries':[{'path':name,'bytes':len(data),'sha256':hash_bytes(data)} for name,data in sorted(entries.items())]}
a.report.parent.mkdir(parents=True,exist_ok=True)
a.report.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'status':'PASS','sourceSha256':result['actualArchiveSha256'],'entryCount':len(entries),'sanitizedReport':str(a.report)}))
