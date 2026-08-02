# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ['FasterCode', 'PySide6.QtCore', 'PySide6.QtGui', 'PySide6.QtWidgets', 'PySide6.QtSvg', 'PySide6.QtMultimedia', 'PySide6.QtMultimediaWidgets', 'charset_normalizer', 'sortedcontainers', 'chess', 'psutil', 'PIL', 'polib', 'deep_translator', 'bs4', 'requests', 'urllib3', 'cpuinfo', 'numpy']
hiddenimports += collect_submodules('Code')
tmp_ret = collect_all('charset_normalizer')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['LucasR.py'],
    pathex=['.', 'OS/win32'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'pandas', 'scipy', 'numba', 'transformers', 'sklearn', 'scikit-learn', 'matplotlib', 'openpyxl', 'fsspec', 'librosa', 'ctranslate2', 'onnxruntime', 'huggingface_hub', 'openai', 'pydantic', 'accelerate', 'safetensors', 'tokenizers', 'sentencepiece', 'faster_whisper'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LucasR',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LucasR',
)
