"""Generate small binary FBX 7.4 fixtures (same skeleton as test_skeleton_ascii.fbx).

Usage: python3 make_binary_fbx.py
Writes test_skeleton_binary.fbx (cm, Y-up, like Unreal) and
test_skeleton_binary_zup_m.fbx (metres, Z-up) next to this script.
"""
import struct
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def prop(t, v):
    if t == 'I':
        return b'I' + struct.pack('<i', v)
    if t == 'L':
        return b'L' + struct.pack('<q', v)
    if t == 'D':
        return b'D' + struct.pack('<d', v)
    if t == 'S':
        b = v.encode('utf-8') if isinstance(v, str) else v
        return b'S' + struct.pack('<I', len(b)) + b
    if t == 'd':
        return b'd' + struct.pack('<III', len(v), 0, 8 * len(v)) + struct.pack('<%dd' % len(v), *v)
    if t == 'i':
        return b'i' + struct.pack('<III', len(v), 0, 4 * len(v)) + struct.pack('<%di' % len(v), *v)
    raise ValueError(t)


NULL_REC = b'\x00' * 13


def node(name, props=(), children=(), offset=0):
    """Serialise a node; returns bytes. `offset` = absolute file offset of node start."""
    plist = b''.join(prop(t, v) for t, v in props)
    nb = name.encode('ascii')
    header_len = 4 + 4 + 4 + 1 + len(nb)
    body = b''
    child_off = offset + header_len + len(plist)
    for c in children:
        cb = c(child_off)
        body += cb
        child_off += len(cb)
    if children:
        body += NULL_REC
    end = offset + header_len + len(plist) + len(body)
    return struct.pack('<III', end, len(props), len(plist)) + struct.pack('<B', len(nb)) + nb + plist + body


def N(name, props=(), children=()):
    return lambda off: node(name, props, children, off)


def P(name, typ, typ2, flags, *vals):
    kinds = {'int': 'I', 'enum': 'I', 'double': 'D', 'Vector3D': 'D', 'Lcl Translation': 'D', 'Lcl Rotation': 'D', 'Lcl Scaling': 'D'}
    k = kinds[typ]
    return N('P', [('S', name), ('S', typ), ('S', typ2), ('S', flags)] + [(k, v) for v in vals])


def model(mid, name, mtype, t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1), pre=None):
    ps = [P('RotationOrder', 'enum', '', '', 0)]
    if pre:
        ps.append(P('PreRotation', 'Vector3D', 'Vector', '', *pre))
    ps += [P('Lcl Translation', 'Lcl Translation', '', 'A', *t),
           P('Lcl Rotation', 'Lcl Rotation', '', 'A', *r),
           P('Lcl Scaling', 'Lcl Scaling', '', 'A', *s)]
    return N('Model', [('L', mid), ('S', name.encode() + b'\x00\x01Model'), ('S', mtype)],
             [N('Version', [('I', 232)]), N('Properties70', [], ps)])


def build(unit_scale=1.0, up_axis=1, out='test_skeleton_binary.fbx'):
    bones = [
        model(1001, 'root', 'LimbNode'),
        model(1002, 'pelvis', 'LimbNode', (0, 96.75 / unit_scale, 0), (90, 0, 90)),
        model(1003, 'spine_01', 'LimbNode', (10.8 / unit_scale, 0, 0), (0, 0, -5), pre=(0, 0, 10)),
        model(1004, 'thigh_l', 'LimbNode', (-1.4 / unit_scale, -0.5 / unit_scale, 9.0 / unit_scale), (0, 180, -6)),
        model(1005, 'thigh_r', 'LimbNode', (-1.4 / unit_scale, -0.5 / unit_scale, -9.0 / unit_scale), (0, 0, 174)),
        model(1006, 'calf_l', 'LimbNode', (42.5 / unit_scale, 0, 0), (0, 0, 8)),
        model(1007, 'calf_r', 'LimbNode', (-42.5 / unit_scale, 0, 0), (0, 0, 8)),
        model(1008, 'ik_foot_root', 'LimbNode'),
        model(1009, 'ik_foot_l', 'LimbNode', (17.3 / unit_scale, 8.1 / unit_scale, -4.2 / unit_scale)),
        model(1100, 'SKM_TestMesh', 'Mesh'),
    ]
    ident_t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 96.75 / unit_scale, 0, 1]
    deformers = [
        N('Deformer', [('L', 2001), ('S', b'\x00\x01Deformer'), ('S', 'Skin')], [N('Version', [('I', 101)]), N('Link_DeformAcuracy', [('D', 50.0)])]),
        N('Deformer', [('L', 2002), ('S', b'\x00\x01SubDeformer'), ('S', 'Cluster')], [
            N('Version', [('I', 100)]),
            N('Indexes', [('i', [0, 1])]),
            N('Weights', [('d', [1.0, 1.0])]),
            N('Transform', [('d', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -96.75 / unit_scale, 0, 1])]),
            N('TransformLink', [('d', ident_t)]),
        ]),
    ]
    conns = [(1001, 0), (1002, 1001), (1003, 1002), (1004, 1002), (1005, 1002), (1006, 1004), (1007, 1005),
             (1008, 1001), (1009, 1008), (1100, 0), (2001, 3001), (2002, 2001), (1002, 2002)]
    top = [
        N('FBXHeaderExtension', [], [
            N('FBXHeaderVersion', [('I', 1003)]), N('FBXVersion', [('I', 7400)]),
            N('CreationTimeStamp', [], [N('Version', [('I', 1000)]), N('Year', [('I', 2026)]), N('Month', [('I', 6)]), N('Day', [('I', 2)]),
                                        N('Hour', [('I', 9)]), N('Minute', [('I', 15)]), N('Second', [('I', 0)]), N('Millisecond', [('I', 0)])]),
            N('Creator', [('S', 'Quinn Rigger binary fixture')]),
        ]),
        N('GlobalSettings', [], [N('Version', [('I', 1000)]), N('Properties70', [], [
            P('UpAxis', 'int', 'Integer', '', up_axis), P('UpAxisSign', 'int', 'Integer', '', 1),
            P('FrontAxis', 'int', 'Integer', '', 2 if up_axis == 1 else 1), P('FrontAxisSign', 'int', 'Integer', '', 1 if up_axis == 1 else -1),
            P('CoordAxis', 'int', 'Integer', '', 0), P('CoordAxisSign', 'int', 'Integer', '', 1),
            P('UnitScaleFactor', 'double', 'Number', '', unit_scale), P('OriginalUnitScaleFactor', 'double', 'Number', '', unit_scale),
        ])]),
        N('Objects', [], bones + deformers),
        N('Connections', [], [N('C', [('S', 'OO'), ('L', a), ('L', b)]) for a, b in conns]),
    ]
    data = b'Kaydara FBX Binary  \x00\x1a\x00' + struct.pack('<I', 7400)
    off = len(data)
    for t in top:
        b = t(off)
        data += b
        off += len(b)
    data += NULL_REC + b'\x00' * 176
    while len(data) % 16:
        data += b'\x00'
    with open(os.path.join(HERE, out), 'wb') as fh:
        fh.write(data)
    print('wrote', out, len(data), 'bytes')


def build_quinn_like(out='test_quinn_like_89.fbx'):
    """89-bone Quinn_Simple-shaped hierarchy (cm, Y-up, identity rotations). Positions approximate."""
    G = {}
    PAR = {}

    def add(name, parent, pos):
        G[name] = pos
        PAR[name] = parent
    add('root', None, (0, 0, 0)); add('pelvis', 'root', (0, 96.75, 0))
    spine = [('spine_01', (0, 105, 1)), ('spine_02', (0, 115, 1)), ('spine_03', (0, 124, 1.5)), ('spine_04', (0, 136, 2)), ('spine_05', (0, 147, 2)),
             ('neck_01', (0, 155, 1)), ('neck_02', (0, 162, 1)), ('head', (0, 170, 2))]
    prev = 'pelvis'
    for n, p in spine:
        add(n, prev, p); prev = n
    for side, sx in (('l', 1), ('r', -1)):
        def s(n): return n + '_' + side
        arm = [('clavicle', 'spine_05', (3, 152, 1)), ('upperarm', 'clavicle', (18, 148, -2)), ('upperarm_twist_01', 'upperarm', (27, 142.7, -2.8)),
               ('upperarm_twist_02', 'upperarm', (35, 137.3, -3.7)), ('lowerarm', 'upperarm', (44, 132, -4.5)), ('lowerarm_twist_01', 'lowerarm', (52, 126.3, -3.7)),
               ('lowerarm_twist_02', 'lowerarm', (60, 120.7, -2.8)), ('hand', 'lowerarm', (68, 115, -2)),
               ('thumb_01', 'hand', (70, 113, 1)), ('thumb_02', 'thumb_01', (72, 112, 2.5)), ('thumb_03', 'thumb_02', (73.5, 111, 3.5)),
               ('index_metacarpal', 'hand', (71, 114.5, -0.5)), ('index_01', 'index_metacarpal', (74, 114, -1)), ('index_02', 'index_01', (77, 113, -1)), ('index_03', 'index_02', (79, 112, -1)),
               ('middle_metacarpal', 'hand', (71, 114, -2)), ('middle_01', 'middle_metacarpal', (74.5, 113, -2.5)), ('middle_02', 'middle_01', (78, 111, -2.5)), ('middle_03', 'middle_02', (80.5, 110, -2.5)),
               ('ring_metacarpal', 'hand', (70.5, 113.5, -3.2)), ('ring_01', 'ring_metacarpal', (74, 112, -4)), ('ring_02', 'ring_01', (77, 110, -4)), ('ring_03', 'ring_02', (79, 109, -4)),
               ('pinky_metacarpal', 'hand', (70, 113, -4.5)), ('pinky_01', 'pinky_metacarpal', (73, 111, -5.5)), ('pinky_02', 'pinky_01', (75.5, 109, -5.5)), ('pinky_03', 'pinky_02', (77.5, 108, -5.5)),
               ('thigh', 'pelvis', (10, 95, -1.5)), ('thigh_twist_01', 'thigh', (10.6, 81, -0.5)), ('thigh_twist_02', 'thigh', (11.3, 67, 0.5)), ('calf', 'thigh', (12, 54, 1)),
               ('calf_twist_01', 'calf', (12.4, 40, 0.3)), ('calf_twist_02', 'calf', (12.8, 26, -0.3)), ('foot', 'calf', (13.5, 12, -4.5)), ('ball', 'foot', (14, 3, 8))]
        for n, par, (x, y, z) in arm:
            add(s(n), par if par in ('spine_05', 'pelvis') else s(par), (sx * x, y, z))
    add('ik_foot_root', 'root', (0, 0, 0)); add('ik_foot_l', 'ik_foot_root', G['foot_l']); add('ik_foot_r', 'ik_foot_root', G['foot_r'])
    add('ik_hand_root', 'root', (0, 0, 0)); add('ik_hand_gun', 'ik_hand_root', G['hand_r']); add('ik_hand_l', 'ik_hand_gun', G['hand_l']); add('ik_hand_r', 'ik_hand_gun', G['hand_r'])
    add('interaction', 'root', (0, 0, 0)); add('center_of_mass', 'root', (0, 0, 0))
    assert len(G) == 89, len(G)
    names = list(G.keys())
    ids = {n: 1000 + i for i, n in enumerate(names)}
    models = []
    for n in names:
        pg = G[PAR[n]] if PAR[n] else (0, 0, 0)
        loc = tuple(G[n][i] - pg[i] for i in range(3))
        models.append(model(ids[n], n, 'LimbNode', loc))
    conns = [(ids[n], ids[PAR[n]] if PAR[n] else 0) for n in names]
    top = [
        N('FBXHeaderExtension', [], [N('FBXHeaderVersion', [('I', 1003)]), N('FBXVersion', [('I', 7400)]), N('Creator', [('S', 'Quinn-like 89-bone fixture (NOT a UE export)')])]),
        N('GlobalSettings', [], [N('Version', [('I', 1000)]), N('Properties70', [], [
            P_('UpAxis', 1), P_('UpAxisSign', 1), P_('FrontAxis', 2), P_('FrontAxisSign', 1), P_('CoordAxis', 0), P_('CoordAxisSign', 1),
            P('UnitScaleFactor', 'double', 'Number', '', 1.0), P('OriginalUnitScaleFactor', 'double', 'Number', '', 1.0)])]),
        N('Objects', [], models),
        N('Connections', [], [N('C', [('S', 'OO'), ('L', a), ('L', b)]) for a, b in conns]),
    ]
    data = b'Kaydara FBX Binary  \x00\x1a\x00' + struct.pack('<I', 7400)
    off = len(data)
    for t in top:
        b = t(off); data += b; off += len(b)
    data += NULL_REC + b'\x00' * 176
    while len(data) % 16:
        data += b'\x00'
    with open(os.path.join(HERE, out), 'wb') as fh:
        fh.write(data)
    print('wrote', out, len(data), 'bytes')


def P_(name, val):
    return P(name, 'int', 'Integer', '', val)


if __name__ == '__main__':
    build(1.0, 1, 'test_skeleton_binary.fbx')
    build(100.0, 2, 'test_skeleton_binary_zup_m.fbx')
    build_quinn_like()
