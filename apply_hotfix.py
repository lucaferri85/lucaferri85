from pathlib import Path

ROOT = Path(__file__).resolve().parent

def patch(path, replacements):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    original = text
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f"Expected text not found in {path}: {old[:80]!r}")
        text = text.replace(old, new)
    p.write_text(text, encoding='utf-8')
    print('patched', path)

patch('frontend/src/lib/unrealCoordinateSystem.js', [
    ("manager.scene.background = new THREE.Color(0x3b3c3f);", "manager.scene.background = new THREE.Color(0x55575b);"),
    ("manager.gridMajor.material.color.setHex(0x67696e)", "manager.gridMajor.material.color.setHex(0x777a80)"),
    ("manager.gridMinor.material.color.setHex(0x4b4d51)", "manager.gridMinor.material.color.setHex(0x62656a)"),
    ("manager.controls.rotateSpeed = -1.0;", "manager.controls.rotateSpeed = 1.0;"),
])

patch('frontend/src/index.css', [
    ("--background: 210 20% 98%;", "--background: 216 12% 91%;"),
    ("--card: 0 0% 100%;", "--card: 216 12% 95%;"),
    ("--popover: 0 0% 100%;", "--popover: 216 12% 96%;"),
    ("--muted: 214 16% 94%;", "--muted: 216 10% 89%;"),
    ("--viewport-bg: #3b3c3f;", "--viewport-bg: #55575b;"),
    ("--panel-bg-deep: #f7f8fa;", "--panel-bg-deep: #e5e7ea;"),
    ("--panel-bg-surface: #ffffff;", "--panel-bg-surface: #f1f2f4;"),
    ("--panel-bg-raised: #e7e9ed;", "--panel-bg-raised: #d9dce0;"),
    ("--panel-border: #cfd3d8;", "--panel-border: #c4c8ce;"),
    ("--panel-border-subtle: #e2e5e9;", "--panel-border-subtle: #d5d8dc;"),
])
print('Hotfix applied successfully.')
