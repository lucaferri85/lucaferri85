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


if __name__ == '__main__':
    build(1.0, 1, 'test_skeleton_binary.fbx')
    build(100.0, 2, 'test_skeleton_binary_zup_m.fbx')
