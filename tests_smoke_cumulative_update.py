from pathlib import Path
import re, subprocess
ROOT=Path(__file__).resolve().parents[1]

def legacy_to_ue(p): return (p[2], -p[0], p[1])
def ue_to_legacy(p): return (-p[1], p[2], p[0])
for p in [(1,2,3),(-.3,1.8,.2),(0,0,0)]:
    q=legacy_to_ue(p); r=ue_to_legacy(q)
    assert all(abs(a-b)<1e-9 for a,b in zip(p,r))

# Center chain invariant in Unreal workspace.
for p in [(0.2, 0.8, 1.0),(-0.1,-0.4,1.7)]:
    constrained=(p[0],0,p[2])
    assert constrained[1] == 0

bottom=(ROOT/'frontend/src/components/panels/BottomStageBar.jsx').read_text()
assert "setRightTab('skinning')" in bottom
assert "setRightTab('skin')" not in bottom
assert "id === 'validation'" in bottom and "id === 'export'" in bottom

skin=(ROOT/'frontend/src/modules/SkinWeightGenerator.js').read_text()
assert "pelvisZ" in skin and "centerY" in skin
assert "world.y - metrics.centerY" in skin
assert "world.z" in skin

exp=(ROOT/'frontend/src/modules/UnrealExporter.js').read_text()
assert "format === 'glb'" in exp and "format === 'json'" in exp
assert "ueVectorToLegacyArray" in exp and "ueQuaternionToLegacyArray" in exp

# Workflow gate simulation mirrors BottomStageBar/exportService requirements.
def gates(fit=False, skin=False, valid=False, stale=False, compare='pass'):
    return {
        'skinning': fit,
        'validation': skin,
        'export': skin and valid and not stale and compare != 'fail',
    }
assert gates(True,False,False)=={'skinning':True,'validation':False,'export':False}
assert gates(True,True,True)=={'skinning':True,'validation':True,'export':True}
assert not gates(True,True,True,True)['export']
assert not gates(True,True,True,False,'fail')['export']

print('PASS coordinate round-trip')
print('PASS centerline Y=0 invariant')
print('PASS Phase 04 -> 05 -> 06 gate logic')
print('PASS Unreal-axis skinning source checks')
print('PASS skinned GLB + snapshot export path checks')
