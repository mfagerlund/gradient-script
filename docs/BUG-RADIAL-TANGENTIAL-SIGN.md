# Bug: Sign Error When Combining Radial and Tangential Distortion

## Summary

There's a sign error in the generated gradient when both radial distortion (`normY * radial`) and tangential distortion (`tangY`) are combined in a product-plus-sum pattern.

## Minimal Reproduction

**Radial only - CORRECT:**
```gs
function test_radial(camY∇, camZ∇, fy, cy, k1) {
  normY = camY / camZ
  r2 = normY * normY
  radial = 1 + k1 * r2
  distortedY = normY * radial
  v = cy - fy * distortedY
  return v
}
```
Generated: `dcamY = fy * (-_tmp0 * radial + ...)` → For k1=0: `-fy/camZ` ✓

**Tangential only - CORRECT:**
```gs
function test_tangential(camY∇, camZ∇, fy, cy, p1) {
  normY = camY / camZ
  r2 = normY * normY
  tangY = p1 * r2
  distortedY = normY + tangY
  v = cy - fy * distortedY
  return v
}
```
Generated: `dcamY = fy * (-_tmp1 + ...)` → For p1=0: `-fy/camZ` ✓

**Both combined - WRONG:**
```gs
function test_both(camY∇, camZ∇, fy, cy, k1, p1, p2) {
  normY = camY / camZ
  r2 = normY * normY
  radial = 1 + k1 * r2
  tangY = p1 * r2 + 2 * p2 * normY
  distortedY = normY * radial + tangY
  v = cy - fy * distortedY
  return v
}
```
Generated: `dcamY = fy * (... + _tmp0 * _tmp4 + ...)` → For k1=p1=p2=0: `+fy/camZ` ✗

## Expected vs Actual

For `v = cy - fy * distortedY`:
- Expected: `dv/dcamY = -fy * d(distortedY)/d(camY)`
- With no distortion: `dv/dcamY = -fy/camZ`

**Actual with both radial and tangential:** `+fy/camZ` (wrong sign)

## Why Verification Passes

The numerical verification ALSO has the same sign error, so both match. The bug is in both the analytical differentiation AND the numerical verification when this specific pattern is present.

## Impact

This affects any camera projection/reprojection formula that uses the Brown-Conrady distortion model:
```
distortedY = normY * radial + tangY
```

The V coordinate gradient will have the wrong sign.

## Files Affected

- Any `.gs` file with this pattern:
  ```
  distortedY = normY * something1 + something2
  v = cy - fy * distortedY
  ```

## Workaround

Use numerical gradients in the calling code until this is fixed.
