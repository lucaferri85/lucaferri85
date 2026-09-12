"""Dense procedural 'armoured muscular humanoid' OBJ for landmark-detector tests (A-pose, Y-up, metres)."""
import math, os, sys
V, F = [], []

def cyl(p0, p1, r0, r1, rings=12, segs=24):
    base = len(V)
    for i in range(rings + 1):
        t = i / rings
        c = [p0[k] + (p1[k] - p0[k]) * t for k in range(3)]
        r = r0 + (r1 - r0) * t
        d = [p1[k] - p0[k] for k in range(3)]; L = math.sqrt(sum(x * x for x in d)) or 1; d = [x / L for x in d]
        up = [1, 0, 0] if abs(d[0]) < 0.9 else [0, 0, 1]
        u = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]
        Lu = math.sqrt(sum(x * x for x in u)); u = [x / Lu for x in u]
        w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
        for j in range(segs):
            a = 2 * math.pi * j / segs
            V.append([c[k] + r * (math.cos(a) * u[k] + math.sin(a) * w[k]) for k in range(3)])
    for i in range(rings):
        for j in range(segs):
            a = base + i * segs + j; b = base + i * segs + (j + 1) % segs
            F.append((a, b, b + segs)); F.append((a, b + segs, a + segs))

def sphere(c, r, rings=12, segs=24):
    base = len(V)
    for i in range(rings + 1):
        ph = math.pi * i / rings
        for j in range(segs):
            th = 2 * math.pi * j / segs
            V.append([c[0] + r * math.sin(ph) * math.cos(th), c[1] + r * math.cos(ph), c[2] + r * math.sin(ph) * math.sin(th)])
    for i in range(rings):
        for j in range(segs):
            a = base + i * segs + j; b = base + i * segs + (j + 1) % segs
            F.append((a, b, b + segs)); F.append((a, b + segs, a + segs))

H = 1.90
# torso (muscular: wide chest), pelvis, neck, head
cyl((0, 1.02, 0), (0, 1.55, 0), 0.19, 0.21); sphere((0, 1.02, 0), 0.18); cyl((0, 1.55, 0), (0, 1.64, 0), 0.07, 0.07); sphere((0, 1.77, 0.02), 0.13)
for s in (1, -1):
    # legs with thick armoured boots (boot radius 0.11 vs shin 0.07)
    cyl((s * 0.11, 1.00, 0), (s * 0.12, 0.55, 0.01), 0.10, 0.075); cyl((s * 0.12, 0.55, 0.01), (s * 0.13, 0.13, -0.02), 0.075, 0.065)
    cyl((s * 0.13, 0.13, -0.02), (s * 0.13, 0.30, -0.02), 0.115, 0.115)  # boot cuff (armour)
    cyl((s * 0.13, 0.0, 0.02), (s * 0.13, 0.12, 0.02), 0.09, 0.09); cyl((s * 0.13, 0.05, -0.08), (s * 0.13, 0.05, 0.16), 0.06, 0.05)  # foot
    # arms A-pose, shoulder joint at x=0.23,y=1.50; big pauldron sphere far outside the joint
    sh = (s * 0.23, 1.50, 0.0); el = (s * 0.47, 1.28, -0.04); wr = (s * 0.66, 1.08, -0.06); tip = (s * 0.78, 0.96, -0.06)
    if '--tpose' in sys.argv:
        sh = (s * 0.23, 1.50, 0.0); el = (s * 0.55, 1.50, -0.02); wr = (s * 0.82, 1.50, -0.03); tip = (s * 0.98, 1.50, -0.03)
    cyl(sh, el, 0.075, 0.06); cyl(el, wr, 0.06, 0.05); cyl(wr, tip, 0.05, 0.03)
    sphere((s * 0.31, 1.54, 0.0), 0.16)  # pauldron: outer edge at x=0.47 (would fake the shoulder if silhouette were used)
    if '--tpose' in sys.argv: cyl((s * 0.72, 1.50, -0.03), (s * 0.84, 1.50, -0.03), 0.10, 0.10)
    else: cyl((s * 0.56, 1.19, -0.05), (s * 0.68, 1.06, -0.06), 0.10, 0.10)  # gauntlet
if '--warrior' in sys.argv:
    # helmet spike (thin protrusion above the skull) and a sword held in the right hand pointing down/outward
    cyl((0, 1.88, 0.02), (0, 2.08, 0.02), 0.012, 0.004)
    cyl((-0.80, 0.94, -0.06), (-1.05, 0.30, -0.06), 0.02, 0.012)
    cyl((-0.74, 0.98, -0.06), (-0.86, 0.90, -0.06), 0.03, 0.03)  # crossguard
name = 'armored_warrior.obj' if '--warrior' in sys.argv else 'armored_tpose.obj' if '--tpose' in sys.argv else 'armored_humanoid.obj'
with open(os.path.join(os.path.dirname(__file__), name), 'w') as f:
    for v in V: f.write('v %.4f %.4f %.4f\n' % tuple(v))
    for a, b, c in F: f.write('f %d %d %d\n' % (a + 1, b + 1, c + 1))
print(len(V), 'verts', len(F), 'faces')
