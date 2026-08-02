import os
import sys

# Auto-close any running instances to avoid permission errors
os.system('taskkill /f /im LucasR.exe >nul 2>&1')
os.system('taskkill /f /im Launch_LucasR.exe >nul 2>&1')

sys.setrecursionlimit(50000)

import PyInstaller.__main__

bin_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(bin_dir)

print(f"Building LucasR.exe in {bin_dir}...")

PyInstaller.__main__.run([
    'LucasR.py',
    '--name=LucasR',
    '--onedir',
    '--console',           # Use --console for debugging; switch to --windowed for release
    '--noconfirm',
    '--clean',
    '--paths=.',
    '--paths=OS/win32',
    # --- Lucas Chess core ---
    '--collect-submodules=Code',
    '--hidden-import=FasterCode',
    # --- PySide6: only the modules Lucas Chess actually uses ---
    '--hidden-import=PySide6.QtCore',
    '--hidden-import=PySide6.QtGui',
    '--hidden-import=PySide6.QtWidgets',
    '--hidden-import=PySide6.QtSvg',
    '--hidden-import=PySide6.QtMultimedia',
    '--hidden-import=PySide6.QtMultimediaWidgets',
    # --- Python dependencies ---
    '--hidden-import=charset_normalizer',
    '--hidden-import=sortedcontainers',
    '--hidden-import=chess',
    '--hidden-import=psutil',
    '--hidden-import=PIL',
    '--hidden-import=polib',
    '--hidden-import=deep_translator',
    '--hidden-import=bs4',
    '--hidden-import=requests',
    '--hidden-import=urllib3',
    '--hidden-import=cpuinfo',
    '--collect-all=charset_normalizer',
    '--hidden-import=numpy',
    # --- Exclude packages NOT needed by Lucas Chess ---
    '--exclude-module=torch',
    '--exclude-module=pandas',
    '--exclude-module=scipy',
    '--exclude-module=numba',
    '--exclude-module=transformers',
    '--exclude-module=sklearn',
    '--exclude-module=scikit-learn',
    '--exclude-module=matplotlib',
    '--exclude-module=openpyxl',
    '--exclude-module=fsspec',
    '--exclude-module=librosa',
    '--exclude-module=ctranslate2',
    '--exclude-module=onnxruntime',
    '--exclude-module=huggingface_hub',
    '--exclude-module=openai',
    '--exclude-module=pydantic',
    '--exclude-module=accelerate',
    '--exclude-module=safetensors',
    '--exclude-module=tokenizers',
    '--exclude-module=sentencepiece',
    '--exclude-module=faster_whisper',
    # --- Output ---
    '--distpath=dist',
    '--workpath=build_temp',
])
import shutil

dist_dir = os.path.join(bin_dir, "dist", "LucasR")
dist_exe = os.path.join(dist_dir, "LucasR.exe")
dist_internal = os.path.join(dist_dir, "_internal")

root_dir = os.path.realpath(os.path.join(bin_dir, ".."))
root_exe = os.path.join(root_dir, "Launch_LucasR.exe")
root_internal = os.path.join(root_dir, "_internal")
bin_internal = os.path.join(bin_dir, "_internal")
bin_exe = os.path.join(bin_dir, "LucasR.exe")

if os.path.exists(dist_exe):
    shutil.copy2(dist_exe, root_exe)
    shutil.copy2(dist_exe, bin_exe)
    if os.path.exists(dist_internal):
        if os.path.exists(root_internal):
            shutil.rmtree(root_internal, ignore_errors=True)
        if os.path.exists(bin_internal):
            shutil.rmtree(bin_internal, ignore_errors=True)
        shutil.copytree(dist_internal, root_internal, dirs_exist_ok=True)
        shutil.copytree(dist_internal, bin_internal, dirs_exist_ok=True)
    print(f"Copied Launch_LucasR.exe & _internal to root: {root_exe}")

print("Build finished successfully!")
