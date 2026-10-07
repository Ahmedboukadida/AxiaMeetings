import os
import re

# Regex patterns
STATIC_ATTR_REGEX = re.compile(r'\b(placeholder|label|title|alt)="([^"{]+)"')
TOAST_REGEX = re.compile(r'\btoast\.(error|success|info|warning)\(\s*["\']([^"\']+)["\']\s*\)')
JSX_TEXT_REGEX = re.compile(r'>([^<{}]+)<')

# Folders to scan
SCAN_FOLDERS = [
    'e:/AxiaProjects/AxiaMeetings/src/app',
    'e:/AxiaProjects/AxiaMeetings/src/components',
    'e:/AxiaProjects/AxiaMeetings/src/lib'
]

# Files/dirs to ignore
IGNORE_PATHS = [
    'e:/AxiaProjects/AxiaMeetings/src/app/api',  # API routes don't render HTML directly
    'e:/AxiaProjects/AxiaMeetings/src/lib/rate-limit.ts',
    'e:/AxiaProjects/AxiaMeetings/src/lib/auth.tsx',
    'e:/AxiaProjects/AxiaMeetings/src/lib/prisma.tsx',
    'e:/AxiaProjects/AxiaMeetings/src/lib/utils.ts'
]

def scan_file(file_path):
    findings = []
    
    # Skip ignored files
    for ignore in IGNORE_PATHS:
        if file_path.replace('\\', '/').startswith(ignore):
            return findings

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Clean multiline comments
        cleaned_content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        lines = cleaned_content.splitlines()
        
        for idx, line in enumerate(lines, 1):
            line_strip = line.strip()
            
            # Skip imports, comments, console logs, type definitions, and CSS classes definition
            if (line_strip.startswith('import ') or 
                line_strip.startswith('//') or 
                line_strip.startswith('*') or 
                line_strip.startswith('console.') or
                line_strip.startswith('className=') or
                'class:' in line_strip or
                'export type' in line_strip or
                'interface ' in line_strip):
                continue
                
            # 1. Match static attributes (e.g., label="Email")
            for match in STATIC_ATTR_REGEX.finditer(line):
                attr, val = match.groups()
                val_strip = val.strip()
                if val_strip and any(c.isalpha() for c in val_strip):
                    findings.append((idx, f'Attribute {attr}="{val_strip}"', line_strip))
                    
            # 2. Match toast alerts with hardcoded strings
            for match in TOAST_REGEX.finditer(line):
                method, val = match.groups()
                val_strip = val.strip()
                if val_strip and any(c.isalpha() for c in val_strip):
                    findings.append((idx, f'Toast.{method}("{val_strip}")', line_strip))
                    
            # 3. Match raw JSX text >Text<
            for match in JSX_TEXT_REGEX.finditer(line):
                text = match.group(1).strip()
                # Ensure it's not a variable expression, a closing brace, punctuation-only, or tailwind-like
                if text and any(c.isalpha() for c in text):
                    # Filter out common JS tokens, imports, icons, Tailwind config names
                    if not re.match(r'^[a-zA-Z0-9_\-]+$', text) or text in ['true', 'false', 'null', 'undefined']:
                        findings.append((idx, f'JSX text: "{text}"', line_strip))
                        
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        
    return findings

def main():
    print("=" * 60)
    print("SCANNING CODEBASE FOR UNTRANSLATED STATIC STRINGS...")
    print("=" * 60)
    
    total_findings = 0
    file_count = 0
    
    for folder in SCAN_FOLDERS:
        for root, _, files in os.walk(folder):
            for file in files:
                if file.endswith(('.tsx', '.ts')):
                    file_path = os.path.join(root, file)
                    file_count += 1
                    findings = scan_file(file_path)
                    if findings:
                        print(f"\nFile: {os.path.relpath(file_path, 'e:/AxiaProjects/AxiaMeetings')}")
                        for line_num, desc, line_content in findings:
                            safe_desc = desc.encode('ascii', errors='replace').decode('ascii')
                            safe_line = line_content.encode('ascii', errors='replace').decode('ascii')
                            print(f"  Line {line_num:3d} | {safe_desc}")
                            print(f"           | Code: {safe_line[:100]}")
                        total_findings += len(findings)
                        
    print("\n" + "=" * 60)
    print(f"Scan complete. Inspected {file_count} files.")
    print(f"Found {total_findings} potential hardcoded static string locations.")
    print("=" * 60)

if __name__ == '__main__':
    main()
