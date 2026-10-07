import json
import os

def get_keys(data, prefix=''):
    keys = set()
    if isinstance(data, dict):
        for k, v in data.items():
            keys.add(prefix + k)
            keys.update(get_keys(v, prefix + k + '.'))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            keys.update(get_keys(v, prefix + str(i) + '.'))
    return keys

def check_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            # Check for duplicates by manually parsing or using a custom decoder
            # Standard json.load handles duplicates by taking the last one
            content = f.read()
            # A simple way to detect duplicates in JSON is to use object_pairs_hook
            def check_duplicates(pairs):
                keys = set()
                for k, v in pairs:
                    if k in keys:
                        print(f"Duplicate key found in {file_path}: {k}")
                    keys.add(k)
                return dict(pairs)
            data = json.loads(content, object_pairs_hook=check_duplicates)
            return data, get_keys(data)
        except json.JSONDecodeError as e:
            print(f"Error decoding {file_path}: {e}")
            return None, set()

script_dir = os.path.dirname(os.path.abspath(__file__))
files = [
    os.path.join(script_dir, 'en.json'),
    os.path.join(script_dir, 'fr.json'),
    os.path.join(script_dir, 'ar.json')
]

data_sets = {}
key_sets = {}

for f in files:
    data, keys = check_json(f)
    data_sets[f] = data
    key_sets[f] = keys

all_keys = set()
for keys in key_sets.values():
    all_keys.update(keys)

for f, keys in key_sets.items():
    missing = all_keys - keys
    if missing:
        print(f"\nMissing keys in {os.path.basename(f)}:")
        for m in sorted(list(missing)):
            print(f"  {m}")
    else:
        print(f"\nNo missing keys in {os.path.basename(f)}")
