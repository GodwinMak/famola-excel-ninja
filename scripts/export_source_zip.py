import os
import sys
import zipfile

def create_zip(output_path, source_dir):
    ignored_names = {
        'node_modules', 'dist', 'build', '.aistudio', '.git', '__pycache__'
    }
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = [d for d in dirs if d not in ignored_names and not d.startswith('.git')]
            for file in files:
                if file.endswith('.pyc') or file == '.DS_Store' or file == 'bun.lock':
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zipf.write(file_path, arcname)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 export_source_zip.py <output_zip_path> <source_dir>")
        sys.exit(1)
    output_zip = sys.argv[1]
    src = sys.argv[2]
    create_zip(output_zip, src)
    print(f"Created {output_zip}")
