import assert from 'assert'
import type {Keyframe} from '@theatre/core/projects/store/types/SheetState_Historic'

function ELEM(v: any, x: any, y: any, z?: any) {
  return v === x || v === y || v === z
}

function BEZT_IS_AUTOH(bezt: BezTriple) {
  return (
    ELEM(bezt.h1, HD_AUTO, HD_AUTO_ANIM) && ELEM(bezt.h2, HD_AUTO, HD_AUTO_ANIM)
  )
}

export type FCurve = {
  bezt: BezTriple[]
  totvert: number
  extend: eFCurve_Extend
  auto_smoothing: eFCurve_Smoothing
}

export type BezTriple = {
  vec: number[][]
  h1: eBezTriple_Handle
  h2: eBezTriple_Handle
  auto_handle_type: eBezTriple_Auto_Type
  f1: eBezTriple_Flag
}
export enum eBezTriple_Auto_Type {
  /* Normal automatic handle that can be refined further. */
  HD_AUTOTYPE_NORMAL = 0,
  /* Handle locked horizontal due to being an Auto Clamped local
   * extreme or a curve endpoint with Constant extrapolation.
   * Further smoothing is disabled. */
  HD_AUTOTYPE_LOCKED_FINAL = 1,
}

export enum eBezTriple_Handle {
  HD_FREE = 0,
  HD_AUTO = 1,
  HD_VECT = 2,
  HD_ALIGN = 3,
  HD_AUTO_ANIM = 4 /* auto-clamped handles for animation */,
  HD_ALIGN_DOUBLESIDE = 5 /* align handles, displayed both of them. used for masks */,
}

export enum eBezTriple_Flag {
  ZERO = 0,
  SELECT = 1 << 0,
  BEZT_FLAG_TEMP_TAG = 1 << 1 /* always clear. */,
  /* Can be used to ignore keyframe points for certain operations. */
  BEZT_FLAG_IGNORE_TAG = 1 << 2,
}

/* curve smoothing modes */
export enum eFCurve_Smoothing {
  /** legacy mode: auto handles only consider adjacent points */
  FCURVE_SMOOTH_NONE = 0,
  /** maintain continuity of the acceleration */
  FCURVE_SMOOTH_CONT_ACCEL = 1,
}

/* extrapolation modes (only simple value 'extending') */
export enum eFCurve_Extend {
  /** Just extend min/max keyframe value. */
  FCURVE_EXTRAPOLATE_CONSTANT = 0,
  /** Just extend gradient of segment between first segment keyframes. */
  FCURVE_EXTRAPOLATE_LINEAR,
}

const {FCURVE_SMOOTH_NONE, FCURVE_SMOOTH_CONT_ACCEL} = eFCurve_Smoothing

const {HD_FREE, HD_AUTO, HD_VECT, HD_ALIGN, HD_AUTO_ANIM, HD_ALIGN_DOUBLESIDE} =
  eBezTriple_Handle

const {HD_AUTOTYPE_NORMAL, HD_AUTOTYPE_LOCKED_FINAL} = eBezTriple_Auto_Type

const {FCURVE_EXTRAPOLATE_CONSTANT, FCURVE_EXTRAPOLATE_LINEAR} = eFCurve_Extend

export function applyAutoTangents(keyframes: Keyframe[]) {
  const bezt: BezTriple[] = keyframes.map((key, i) => {
    const prevKey: Keyframe = keyframes[i - 1] ?? key
    const nextKeyframe: Keyframe = keyframes[i + 1] ?? key

    const t1x = lerp(prevKey.position, key.position, key.handles[0])
    const t1y = lerp(
      prevKey.value as number,
      key.value as number,
      key.handles[1],
    )

    const px = key.position
    const py = key.value as number

    const t2x = lerp(key.position, nextKeyframe.position, key.handles[2])
    const t2y = lerp(
      key.value as number,
      nextKeyframe.value as number,
      key.handles[3],
    )
    return {
      vec: [
        [t1x, t1y, 0],
        [px, py, 0],
        [t2x, t2y, 0],
      ],
      h1:
        key.tangentIn === 'auto'
          ? eBezTriple_Handle.HD_AUTO_ANIM
          : eBezTriple_Handle.HD_FREE,
      h2:
        key.tangentOut === 'auto'
          ? eBezTriple_Handle.HD_AUTO_ANIM
          : eBezTriple_Handle.HD_FREE,
      auto_handle_type: eBezTriple_Auto_Type.HD_AUTOTYPE_NORMAL,
      f1: eBezTriple_Flag.ZERO,
    }
  })

  const curve: FCurve = {
    bezt,
    totvert: bezt.length,
    auto_smoothing: eFCurve_Smoothing.FCURVE_SMOOTH_CONT_ACCEL,
    extend: eFCurve_Extend.FCURVE_EXTRAPOLATE_CONSTANT,
  }

  BKE_fcurve_handles_recalc(curve)

  const result: Keyframe[] = []

  for (let i = 0; i < keyframes.length; i++) {
    const key: Keyframe = {
      ...keyframes[i],
      handles: keyframes[i].handles.map((handle) => handle) as [
        number,
        number,
        number,
        number,
      ],
    }
    const prevKey: Keyframe = keyframes[i - 1]
    const nextKeyframe: Keyframe = keyframes[i + 1]

    const bezier = bezt[i]

    if (prevKey) {
      const h1 = ilerp(prevKey.position, key.position, bezier.vec[0][0])
      const h2 = ilerp(
        prevKey.value as number,
        key.value as number,
        bezier.vec[0][1],
      )
      key.handles[0] = h1
      key.handles[1] = h2
    }

    if (nextKeyframe) {
      const h3 = ilerp(key.position, nextKeyframe.position, bezier.vec[2][0])
      const h4 = ilerp(
        key.value as number,
        nextKeyframe.value as number,
        bezier.vec[2][1],
      )

      key.handles[2] = h3
      key.handles[3] = h4
    }
    result.push(key)
  }
  return result
}

function lerp(a: number, b: number, t: number) {
  return (1 - t) * a + b * t
}

function ilerp(a: number, b: number, c: number) {
  return (a - c) / (a - b)
}

function BKE_fcurve_handles_recalc(fcu: FCurve) {
  BKE_fcurve_handles_recalc_ex(fcu, eBezTriple_Flag.SELECT)
}

function BKE_fcurve_handles_recalc_ex(
  fcu: FCurve,
  handle_sel_flag: eBezTriple_Flag,
) {
  let a = fcu.totvert

  /* Error checking:
   * - Need at least two points.
   * - Need bezier keys.
   * - Only bezier-interpolation has handles (for now).
   */
  if (
    a <
    2 /* || ELEM(NULL, fcu, fcu.bezt)   || ELEM(fcu->ipo, BEZT_IPO_CONST, BEZT_IPO_LIN) */
  ) {
    return
  }

  /* If the first modifier is Cycles, smooth the curve through the cycle. */
  // const first = fcu.bezt[0], last = fcu.bezt[fcu.totvert - 1]

  const cycle = false //BKE_fcurve_is_cyclic(fcu) && BEZT_IS_AUTOH(first) && BEZT_IS_AUTOH(last);

  let bezt_index = 0
  let prev_index = -1
  let next_index = 1

  /* Loop over all beztriples, adjusting handles. */
  while (a--) {
    /* Get initial pointers. */
    let bezt: BezTriple = fcu.bezt[bezt_index]
    let prev = fcu.bezt[prev_index] as BezTriple | undefined //cycle_offset_triple(cycle, fcu.bezt[fcu.totvert - 2], last, first);
    let next = fcu.bezt[next_index] as BezTriple | undefined

    /* Clamp timing of handles to be on either side of beztriple. */
    if (bezt.vec[0][0] > bezt.vec[1][0]) {
      bezt.vec[0][0] = bezt.vec[1][0]
    }
    if (bezt.vec[2][0] < bezt.vec[1][0]) {
      bezt.vec[2][0] = bezt.vec[1][0]
    }

    /* Calculate auto-handles. */
    BKE_nurb_handle_calc_ex(
      bezt,
      prev,
      next,
      handle_sel_flag,
      true,
      fcu.auto_smoothing,
    )

    /* For automatic ease in and out. */
    if (BEZT_IS_AUTOH(bezt) && !cycle) {
      /* Only do this on first or last beztriple. */
      if (ELEM(a, 0, fcu.totvert - 1)) {
        /* Set both handles to have same horizontal value as keyframe. */
        if (fcu.extend == FCURVE_EXTRAPOLATE_CONSTANT) {
          bezt.vec[0][1] = bezt.vec[2][1] = bezt.vec[1][1]
          /* Remember that these keyframes are special, they don't need to be adjusted. */
          bezt.auto_handle_type = HD_AUTOTYPE_LOCKED_FINAL
        }
      }
    }

    /* Avoid total smoothing failure on duplicate keyframes (can happen during grab). */
    if (prev && prev.vec[1][0] >= bezt.vec[1][0]) {
      prev.auto_handle_type = bezt.auto_handle_type = HD_AUTOTYPE_LOCKED_FINAL
    }

    /* Advance pointers for next iteration. */
    // prev = bezt;
    prev_index = bezt_index

    if (a == 1) {
      //next = cycle_offset_triple(cycle, fcu.bezt[1], first, last);
      next_index = -1
    } else if (next != null) {
      next_index++
    }

    bezt_index++
  }

  /* If cyclic extrapolation and Auto Clamp has triggered, ensure it is symmetric. */
  /*   if (cycle && (first->auto_handle_type != HD_AUTOTYPE_NORMAL ||
      last->auto_handle_type != HD_AUTOTYPE_NORMAL))
  {
      first->vec[0][1] = first->vec[2][1] = first->vec[1][1];
      last->vec[0][1] = last->vec[2][1] = last->vec[1][1];
      first->auto_handle_type = last->auto_handle_type = HD_AUTOTYPE_LOCKED_FINAL;
  } */

  /* Do a second pass for auto handle: compute the handle to have 0 acceleration step. */
  if (fcu.auto_smoothing != FCURVE_SMOOTH_NONE) {
    BKE_nurb_handle_smooth_fcurve(fcu.bezt, fcu.totvert, cycle)
  }
}

/* Shifts 'in' by the difference in coordinates between 'to' and 'from',
 * using 'out' as the output buffer.
 * When 'to' and 'from' are end points of the loop, this moves the 'in' point one loop cycle.
 */
function cycle_offset_triple(
  cycle: boolean,
  $in: Readonly<BezTriple>,
  from: Readonly<BezTriple>,
  to: Readonly<BezTriple>,
) {
  if (!cycle) {
    return null
  }
  return null
  /* memcpy(out, in, sizeof(BezTriple));

  float delta[3];
  sub_v3_v3v3(delta, to->vec[1], from->vec[1]);

  for (int i = 0; i < 3; i++) {
      add_v3_v3(out->vec[i], delta);
  }

  return out; */
}
function BKE_fcurve_is_cyclic(fcu: FCurve) {
  return false
}

function BKE_nurb_handle_calc_ex(
  bezt: BezTriple,
  prev: BezTriple | undefined,
  next: BezTriple | undefined,
  handle_sel_flag: eBezTriple_Flag,
  is_fcurve: boolean,
  smoothing: eFCurve_Smoothing,
) {
  calchandleNurb_intern(
    bezt,
    prev,
    next,
    handle_sel_flag,
    is_fcurve,
    false,
    smoothing,
  )
}

function BKE_nurb_handle_smooth_fcurve(
  bezt: BezTriple[],
  total: number,
  cyclic: boolean,
) {
  /* ignore cyclic extrapolation if end points are locked */
  const isCyclic =
    cyclic && is_free_auto_point(bezt[0]) && is_free_auto_point(bezt[total - 1])

  /* if cyclic, try to find a sequence break point */
  let search_base = 0

  if (isCyclic) {
    for (let i = 1; i < total - 1; i++) {
      if (!is_free_auto_point(bezt[i])) {
        search_base = i
        break
      }
    }

    /* all points of the curve are freely changeable auto handles - solve as full cycle */
    if (search_base == 0) {
      bezier_handle_calc_smooth_fcurve(bezt, total, 0, total, cyclic)
      return
    }
  }

  /* Find continuous sub-sequences of free auto handles and smooth them, starting at search_base.
   * In cyclic mode these sub-sequences can span the cycle boundary. */
  let start = search_base,
    count = 1

  for (let i = 1, j = start + 1; i < total; i++, j++) {
    /* in cyclic mode: jump from last to first point when necessary */
    if (j == total - 1 && cyclic) {
      j = 0
    }

    /* non auto handle closes the list (we come here at least for the last handle, see above) */
    if (!is_free_auto_point(bezt[j])) {
      bezier_handle_calc_smooth_fcurve(bezt, total, start, count + 1, cyclic)
      start = j
      count = 1
    } else {
      count++
    }
  }

  if (count > 1) {
    bezier_handle_calc_smooth_fcurve(bezt, total, start, count, cyclic)
  }
}

function bezier_handle_calc_smooth_fcurve(
  bezt: BezTriple[],
  total: number,
  start: number,
  count: number,
  cycle: boolean,
) {
  //float *dx, *dy, *l, *a, *b, *c, *d, *h, *hmax, *hmin;
  //float **arrays[] = {&dx, &dy, &l, &a, &b, &c, &d, &h, &hmax, &hmin, nullptr};

  let solve_count = count

  /* verify index ranges */
  if (count < 2) {
    return
  }

  assert(start < total - 1 && count <= total)
  assert(start + count <= total || cycle)

  const full_cycle = start == 0 && count == total && cycle

  const bezt_first = bezt[start]
  const bezt_last =
    bezt[start + count > total ? start + count - total : start + count - 1]

  let solve_first = bezier_check_solve_end_handle(
    bezt_first,
    bezt_first.h2,
    start == 0,
  )
  let solve_last = bezier_check_solve_end_handle(
    bezt_last,
    bezt_last.h1,
    start + count == total,
  )

  if (count == 2 && !full_cycle && solve_first == solve_last) {
    return
  }

  /* allocate all */

  const [dx, dy, l, a, b, c, d, h, hmax, hmin] = Array.from({length: 10}).map(
    () => new Float64Array(count),
  )
  /*void *tmp_buffer = allocate_arrays(count, arrays, nullptr, "bezier_calc_smooth_tmp");
  if (!tmp_buffer) {
    return;
  }*/

  /* point locations */
  dx[0] = dy[0] = Number.NaN

  for (let i = 1, j = start + 1; i < count; i++, j++) {
    dx[i] = bezt[j].vec[1][0] - bezt[j - 1].vec[1][0]
    dy[i] = bezt[j].vec[1][1] - bezt[j - 1].vec[1][1]

    /* when cyclic, jump from last point to first */
    if (cycle && j == total - 1) {
      j = 0
    }
  }

  /* ratio of x intervals */

  if (full_cycle) {
    dx[0] = dx[count - 1]
    dy[0] = dy[count - 1]

    l[0] = l[count - 1] = dx[1] / dx[0]
  } else {
    l[0] = l[count - 1] = 1.0
  }

  for (let i = 1; i < count - 1; i++) {
    l[i] = dx[i + 1] / dx[i]
  }

  /* compute handle clamp ranges */

  let clamped_prev = false,
    clamped_cur = ELEM(
      HD_AUTO_ANIM,
      bezt_first.h1,
      HD_AUTO_ANIM === bezt_first.h2,
    )

  for (let i = 0; i < count; i++) {
    hmax[i] = Number.MAX_VALUE
    hmin[i] = -Number.MAX_VALUE
  }

  for (let i = 1, j = start + 1; i < count; i++, j++) {
    clamped_prev = clamped_cur
    clamped_cur = ELEM(HD_AUTO_ANIM, bezt[j].h1, bezt[j].h2)

    if (cycle && j == total - 1) {
      j = 0
      clamped_cur = clamped_cur || ELEM(HD_AUTO_ANIM, bezt[j].h1, bezt[j].h2)
    }

    bezier_clamp(hmax, hmin, i - 1, dy[i], clamped_prev, clamped_prev)
    bezier_clamp(hmax, hmin, i, dy[i] * l[i], clamped_cur, clamped_cur)
  }

  /* full cycle merges first and last points into continuous loop */

  let first_handle_adj = 0.0,
    last_handle_adj = 0.0

  if (full_cycle) {
    /* reduce the number of unknowns by one */
    let i = (solve_count = count - 1)

    hmin[0] = max_ff(hmin[0], hmin[i])
    hmax[0] = min_ff(hmax[0], hmax[i])

    solve_first = solve_last = true

    bezier_eq_continuous(a, b, c, d, dy, l, 0)
  } else {
    let tmp = [0, 0]

    /* boundary condition: fixed handles or zero curvature */
    if (!solve_first) {
      sub_v2_v2v2(tmp, bezt_first.vec[2], bezt_first.vec[1])
      first_handle_adj = bezier_calc_handle_adj(tmp, dx[1])

      bezier_lock_unknown(a, b, c, d, 0, tmp[1])
    } else {
      bezier_eq_noaccel_right(a, b, c, d, dy, l, 0)
    }

    if (!solve_last) {
      sub_v2_v2v2(tmp, bezt_last.vec[1], bezt_last.vec[0])
      last_handle_adj = bezier_calc_handle_adj(tmp, dx[count - 1])

      bezier_lock_unknown(a, b, c, d, count - 1, tmp[1])
    } else {
      bezier_eq_noaccel_left(a, b, c, d, dy, l, count - 1)
    }
  }

  /* main tridiagonal system of equations */

  for (let i = 1; i < count - 1; i++) {
    bezier_eq_continuous(a, b, c, d, dy, l, i)
  }

  /* apply correction for user-defined handles with nonstandard x positions */

  if (!full_cycle) {
    if (count > 2 || solve_last) {
      b[1] += l[1] * first_handle_adj
    }

    if (count > 2 || solve_first) {
      b[count - 2] += last_handle_adj
    }
  }

  /* solve and output results */

  if (tridiagonal_solve_with_limits(a, b, c, d, h, hmin, hmax, solve_count)) {
    if (full_cycle) {
      h[count - 1] = h[0]
    }

    for (let i = 1, j = start + 1; i < count - 1; i++, j++) {
      const end = j == total - 1
      bezier_output_handle(bezt[j], false, -h[i] / l[i], end)

      if (end) {
        j = 0
      }

      bezier_output_handle(bezt[j], true, h[i], end)
    }

    if (solve_first) {
      bezier_output_handle(bezt_first, true, h[0], start == 0)
    }

    if (solve_last) {
      bezier_output_handle(
        bezt_last,
        false,
        -h[count - 1] / l[count - 1],
        start + count == total,
      )
    }
  }

  /* free all */
  // free_arrays(tmp_buffer);
}

function max_ff(a: number, b: number): number {
  return a > b ? a : b
}

function min_ff(a: number, b: number): number {
  return a < b ? a : b
}

function sub_v2_v2v2(tmp: number[], arg1: number[], arg2: number[]) {
  tmp[0] = arg1[0] - arg2[0]
  tmp[1] = arg1[1] - arg2[1]
}

function mul_v2_fl(tmp: number[], fac: number) {
  tmp[0] *= fac
  tmp[1] *= fac
}

function bezier_calc_handle_adj(hsize: number[], dx: number): number {
  /* if handles intersect in x direction, they are scaled to fit */
  const fac = dx / (hsize[0] + dx / 3.0)
  if (fac < 1.0) {
    mul_v2_fl(hsize, fac)
  }
  return 1.0 - (3.0 * hsize[0]) / dx
}

function bezier_lock_unknown(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  i: number,
  value: number,
) {
  a[i] = c[i] = 0.0
  b[i] = 1.0
  d[i] = value
}

function bezier_check_solve_end_handle(
  bezt: BezTriple,
  htype: eBezTriple_Handle,
  end: boolean,
) {
  return (
    htype == HD_VECT ||
    (end &&
      ELEM(htype, HD_AUTO, HD_AUTO_ANIM) &&
      bezt.auto_handle_type == HD_AUTOTYPE_NORMAL)
  )
}

function bezier_clamp(
  hmax: Float64Array,
  hmin: Float64Array,
  i: number,
  dy: number,
  no_reverse: boolean,
  no_overshoot: boolean,
) {
  if (dy > 0) {
    if (no_overshoot) {
      hmax[i] = min_ff(hmax[i], dy)
    }
    if (no_reverse) {
      hmin[i] = 0.0
    }
  } else if (dy < 0) {
    if (no_reverse) {
      hmax[i] = 0.0
    }
    if (no_overshoot) {
      hmin[i] = max_ff(hmin[i], dy)
    }
  } else if (no_reverse || no_overshoot) {
    hmax[i] = hmin[i] = 0.0
  }
}

function bezier_eq_noaccel_left(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  dy: Float64Array,
  l: Float64Array,
  i: number,
) {
  a[i] = l[i] * l[i]
  b[i] = 2.0 * l[i]
  c[i] = 0.0
  d[i] = dy[i] * l[i] * l[i]
}
function bezier_eq_noaccel_right(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  dy: Float64Array,
  l: Float64Array,
  i: number,
) {
  a[i] = 0.0
  b[i] = 2.0
  c[i] = 1.0 / l[i + 1]
  d[i] = dy[i + 1]
}

function bezier_eq_continuous(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  dy: Float64Array,
  l: Float64Array,
  i: number,
) {
  a[i] = l[i] * l[i]
  b[i] = 2.0 * (l[i] + 1)
  c[i] = 1.0 / l[i + 1]
  d[i] = dy[i] * l[i] * l[i] + dy[i + 1]
}

function tridiagonal_solve_with_limits(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  h: Float64Array,
  hmin: Float64Array,
  hmax: Float64Array,
  solve_count: number,
) {
  //float *a0, *b0, *c0, *d0;
  //float **arrays[] = {&a0, &b0, &c0, &d0, nullptr};
  //char *is_locked, *num_unlocks;
  // char **flagarrays[] = {&is_locked, &num_unlocks, nullptr};

  //void *tmps = allocate_arrays(solve_count, arrays, flagarrays, "tridiagonal_solve_with_limits");
  //if (!tmps) {
  //  return false;
  //}

  const [a0, b0, c0, d0] = [0, 1, 2, 3].map(() => new Float64Array(solve_count))
  const is_locked = new Uint8Array(solve_count)
  const num_unlocks = new Uint8Array(solve_count)

  memcpyFloat64(a0, a, solve_count)
  memcpyFloat64(b0, b, solve_count)
  memcpyFloat64(c0, c, solve_count)
  memcpyFloat64(d0, d, solve_count)

  memsetUint8(is_locked, 0, solve_count)
  memsetUint8(num_unlocks, 0, solve_count)

  let overshoot = false,
    unlocked = false

  do {
    if (!BLI_tridiagonal_solve_cyclic(a, b, c, d, h, solve_count)) {
      // free_arrays(tmps);
      return false
    }

    /* first check if any handles overshoot the limits, and lock them */
    let all = false,
      locked = false

    overshoot = unlocked = false

    do {
      for (let i = 0; i < solve_count; i++) {
        if (h[i] >= hmin[i] && h[i] <= hmax[i]) {
          continue
        }

        overshoot = true

        const target = h[i] > hmax[i] ? hmax[i] : hmin[i]

        /* heuristically only lock handles that go in the right direction if there are such ones */
        if (target != 0.0 || all) {
          /* mark item locked */
          is_locked[i] = 1

          bezier_lock_unknown(a, b, c, d, i, target)
          locked = true
        }
      }

      all = true
    } while (overshoot && !locked)

    /* If no handles overshot and were locked,
     * see if it may be a good idea to unlock some handles. */
    if (!locked) {
      for (let i = 0; i < solve_count; i++) {
        /* to definitely avoid infinite loops limit this to 2 times */
        if (!is_locked[i] || num_unlocks[i] >= 2) {
          continue
        }

        /* if the handle wants to move in allowable direction, release it */
        const relax = bezier_relax_direction(a0, b0, c0, d0, h, i, solve_count)

        if ((relax > 0 && h[i] < hmax[i]) || (relax < 0 && h[i] > hmin[i])) {
          bezier_restore_equation(a, b, c, d, a0, b0, c0, d0, i)

          is_locked[i] = 0
          num_unlocks[i]++
          unlocked = true
        }
      }
    }
  } while (overshoot || unlocked)

  // free_arrays(tmps);
  return true
}

function bezier_output_handle(
  bezt: BezTriple,
  right: boolean,
  dy: number,
  endpoint: boolean,
) {
  let tmp = [0, 0, 0]

  copy_v3_v3(tmp, bezt.vec[right ? 2 : 0])

  tmp[1] = bezt.vec[1][1] + dy

  bezier_output_handle_inner(bezt, right, tmp, endpoint)
}
function bezier_output_handle_inner(
  bezt: BezTriple,
  right: boolean,
  newval: number[],
  endpoint: boolean,
) {
  const tmp = [0, 0, 0]

  const idx = right ? 2 : 0
  const hr = right ? bezt.h2 : bezt.h1
  const hm = right ? bezt.h1 : bezt.h2

  /* only assign Auto/Vector handles */
  if (!ELEM(hr, HD_AUTO, HD_AUTO_ANIM, HD_VECT)) {
    return
  }

  copy_v3_v3(bezt.vec[idx], newval)

  /* fix up the Align handle if any */
  if (ELEM(hm, HD_ALIGN, HD_ALIGN_DOUBLESIDE)) {
    const hlen = len_v3v3(bezt.vec[1], bezt.vec[2 - idx])
    const h2len = len_v3v3(bezt.vec[1], bezt.vec[idx])

    sub_v3_v3v3(tmp, bezt.vec[1], bezt.vec[idx])
    madd_v3_v3v3fl(bezt.vec[2 - idx], bezt.vec[1], tmp, hlen / h2len)
  } else if (endpoint && ELEM(hm, HD_AUTO, HD_AUTO_ANIM, HD_VECT)) {
    /* at end points of the curve, mirror handle to the other side */
    sub_v3_v3v3(tmp, bezt.vec[1], bezt.vec[idx])
    add_v3_v3v3(bezt.vec[2 - idx], bezt.vec[1], tmp)
  }
}

function BLI_tridiagonal_solve_cyclic(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  r_x: Float64Array,
  count: number,
) {
  if (count < 1) {
    return false
  }

  /* Degenerate case not handled correctly by the generic formula. */
  if (count == 1) {
    r_x[0] = d[0] / (a[0] + b[0] + c[0])

    return isfinite(r_x[0])
  }

  /* Degenerate case that works but can be simplified. */
  if (count == 2) {
    const a2 = new Float64Array([0, a[1] + c[1]])
    const c2 = new Float64Array([a[0] + c[0], 0])

    return BLI_tridiagonal_solve(a2, b, c2, d, r_x, count)
  }

  /* If not really cyclic, fall back to the simple solver. */
  const a0 = a[0],
    cN = c[count - 1]

  if (a0 == 0.0 && cN == 0.0) {
    return BLI_tridiagonal_solve(a, b, c, d, r_x, count)
  }

  //size_t bytes = sizeof(float) * (uint)count;
  const tmp = new Float64Array(count * 2) // "tridiagonal_ex";
  if (!tmp) {
    return false
  }
  const b2 = tmp.subarray(count)

  /* Prepare the non-cyclic system; relies on tridiagonal_solve ignoring values. */
  memcpyFloat64(b2, b, count)

  b2[0] -= a0
  b2[count - 1] -= cN

  memsetFloat64(tmp, 0, count)
  tmp[0] = a0
  tmp[count - 1] = cN

  /* solve for partial solution and adjustment vector */
  const success =
    BLI_tridiagonal_solve(a, b2, c, tmp, tmp, count) &&
    BLI_tridiagonal_solve(a, b2, c, d, r_x, count)

  /* apply adjustment */
  if (success) {
    const coeff = (r_x[0] + r_x[count - 1]) / (1.0 + tmp[0] + tmp[count - 1])

    for (let i = 0; i < count; i++) {
      r_x[i] -= coeff * tmp[i]
    }
  }
  //MEM_freeN(tmp);
}

function BLI_tridiagonal_solve(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  r_x: Float64Array,
  count: number,
) {
  if (count < 1) {
    return false
  }

  //size_t bytes = sizeof(double) * (uint)count;
  const c1 = new Float64Array(2 * count) // "tridiagonal_c1d1");
  const d1 = c1.subarray(count)

  if (!c1) {
    return false
  }

  let i
  let c_prev = 0,
    d_prev,
    x_prev

  /* forward pass */

  c1[0] = c_prev = c[0] / b[0]
  d1[0] = d_prev = d[0] / b[0]

  for (i = 1; i < count; i++) {
    const denum = b[i] - a[i] * c_prev

    c1[i] = c_prev = c[i] / denum
    d1[i] = d_prev = (d[i] - a[i] * d_prev) / denum
  }

  /* back pass */

  x_prev = d_prev
  r_x[--i] = x_prev

  while (--i >= 0) {
    x_prev = d1[i] - c1[i] * x_prev
    r_x[i] = x_prev
  }

  // MEM_freeN(c1);

  return isfinite(x_prev)
}

function isfinite(x: number): boolean {
  return Number.isFinite(x)
}

function bezier_relax_direction(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  h: Float64Array,
  i: number,
  count: number,
) {
  /* current deviation between sides of the equation */
  const state =
    a[i] * h[(i + count - 1) % count] +
    b[i] * h[i] +
    c[i] * h[(i + 1) % count] -
    d[i]

  /* only the sign is meaningful */
  return -state * b[i]
}

function bezier_restore_equation(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  d: Float64Array,
  a0: Float64Array,
  b0: Float64Array,
  c0: Float64Array,
  d0: Float64Array,
  i: number,
) {
  a[i] = a0[i]
  b[i] = b0[i]
  c[i] = c0[i]
  d[i] = d0[i]
}

function copy_v3_v3(r: number[], a: number[]) {
  r[0] = a[0]
  r[1] = a[1]
  r[2] = a[2]
}

function len_v3v3(a: number[], b: number[]): number {
  const d = [0, 0, 0]
  sub_v3_v3v3(d, b, a)
  return len_v3(d)
}
function len_v3(a: number[]): number {
  return Math.sqrt(dot_v3v3(a, a))
}
function sub_v3_v3v3(r: number[], a: readonly number[], b: readonly number[]) {
  r[0] = a[0] - b[0]
  r[1] = a[1] - b[1]
  r[2] = a[2] - b[2]
}

function madd_v3_v3v3fl(
  r: number[],
  a: readonly number[],
  b: readonly number[],
  f: number,
) {
  r[0] = a[0] + b[0] * f
  r[1] = a[1] + b[1] * f
  r[2] = a[2] + b[2] * f
}
function add_v3_v3v3(r: number[], a: readonly number[], b: readonly number[]) {
  r[0] = a[0] + b[0]
  r[1] = a[1] + b[1]
  r[2] = a[2] + b[2]
}

function dot_v3v3(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function memsetFloat64(mem: Float64Array, value: number, count: number) {
  mem.fill(value, 0, count)
}
function memcpyFloat64(mem: Float64Array, src: Float64Array, count: number) {
  for (let i = 0; i < count; i++) {
    mem[i] = src[i]
  }
}

function memsetUint8(mem: Uint8Array, value: number, count: number) {
  mem.fill(value, 0, count)
}
function calchandleNurb_intern(
  bezt: BezTriple,
  prev: BezTriple | undefined,
  next: BezTriple | undefined,
  handle_sel_flag: eBezTriple_Flag,
  is_fcurve: boolean,
  skip_align: boolean,
  fcurve_smoothing: eFCurve_Smoothing,
) {
  /* defines to avoid confusion */
  //#define p2_h1 ((p2)-3)
  //#define p2_h2 ((p2) + 3)

  let p1: readonly number[], p3: readonly number[] // const
  const pt = [0, 0, 0],
    dvec_a = [0, 0, 0],
    dvec_b = [0, 0, 0]
  let len, len_a, len_b
  const eps = 1e-5

  /* assume normal handle until we check */
  bezt.auto_handle_type = HD_AUTOTYPE_NORMAL

  if (bezt.h1 == 0 && bezt.h2 == 0) {
    return
  }
  const p2_h1 = bezt.vec[0]
  const p2 = bezt.vec[1]
  const p2_h2 = bezt.vec[2]

  if (prev === undefined) {
    p3 = next!.vec[1]
    pt[0] = 2.0 * p2[0] - p3[0]
    pt[1] = 2.0 * p2[1] - p3[1]
    pt[2] = 2.0 * p2[2] - p3[2]
    p1 = pt
  } else {
    p1 = prev.vec[1]
  }

  if (next == undefined) {
    pt[0] = 2.0 * p2[0] - p1[0]
    pt[1] = 2.0 * p2[1] - p1[1]
    pt[2] = 2.0 * p2[2] - p1[2]
    p3 = pt
  } else {
    p3 = next.vec[1]
  }

  sub_v3_v3v3(dvec_a, p2, p1)
  sub_v3_v3v3(dvec_b, p3, p2)

  if (is_fcurve) {
    len_a = dvec_a[0]
    len_b = dvec_b[0]
  } else {
    len_a = len_v3(dvec_a)
    len_b = len_v3(dvec_b)
  }

  if (len_a == 0.0) {
    len_a = 1.0
  }
  if (len_b == 0.0) {
    len_b = 1.0
  }

  if (
    ELEM(bezt.h1, HD_AUTO, HD_AUTO_ANIM) ||
    ELEM(bezt.h2, HD_AUTO, HD_AUTO_ANIM)
  ) {
    /* auto */
    const tvec = [0, 0, 0]
    tvec[0] = dvec_b[0] / len_b + dvec_a[0] / len_a
    tvec[1] = dvec_b[1] / len_b + dvec_a[1] / len_a
    tvec[2] = dvec_b[2] / len_b + dvec_a[2] / len_a

    if (is_fcurve) {
      if (fcurve_smoothing != FCURVE_SMOOTH_NONE) {
        /* force the horizontal handle size to be 1/3 of the key interval so that
         * the X component of the parametric bezier curve is a linear spline */
        len = 6.0 / 2.5614
      } else {
        len = tvec[0]
      }
    } else {
      len = len_v3(tvec)
    }
    len *= 2.5614

    if (len != 0.0) {
      /* Only for F-Curves. */
      let leftviolate = false,
        rightviolate = false

      if (!is_fcurve || fcurve_smoothing == FCURVE_SMOOTH_NONE) {
        if (len_a > 5.0 * len_b) {
          len_a = 5.0 * len_b
        }
        if (len_b > 5.0 * len_a) {
          len_b = 5.0 * len_a
        }
      }

      if (ELEM(bezt.h1, HD_AUTO, HD_AUTO_ANIM)) {
        len_a /= len
        madd_v3_v3v3fl(p2_h1, p2, tvec, -len_a)

        if (bezt.h1 == HD_AUTO_ANIM && next && prev) {
          /* keep horizontal if extrema */
          const ydiff1 = prev.vec[1][1] - bezt.vec[1][1]
          const ydiff2 = next.vec[1][1] - bezt.vec[1][1]
          if (
            (ydiff1 <= 0.0 && ydiff2 <= 0.0) ||
            (ydiff1 >= 0.0 && ydiff2 >= 0.0)
          ) {
            bezt.vec[0][1] = bezt.vec[1][1]
            bezt.auto_handle_type = HD_AUTOTYPE_LOCKED_FINAL
          } else {
            /* handles should not be beyond y coord of two others */
            if (ydiff1 <= 0.0) {
              if (prev.vec[1][1] > bezt.vec[0][1]) {
                bezt.vec[0][1] = prev.vec[1][1]
                leftviolate = true
              }
            } else {
              if (prev.vec[1][1] < bezt.vec[0][1]) {
                bezt.vec[0][1] = prev.vec[1][1]
                leftviolate = true
              }
            }
          }
        }
      }
      if (ELEM(bezt.h2, HD_AUTO, HD_AUTO_ANIM)) {
        len_b /= len
        madd_v3_v3v3fl(p2_h2, p2, tvec, len_b)

        if (bezt.h2 == HD_AUTO_ANIM && next && prev) {
          /* keep horizontal if extrema */
          const ydiff1 = prev.vec[1][1] - bezt.vec[1][1]
          const ydiff2 = next.vec[1][1] - bezt.vec[1][1]
          if (
            (ydiff1 <= 0.0 && ydiff2 <= 0.0) ||
            (ydiff1 >= 0.0 && ydiff2 >= 0.0)
          ) {
            bezt.vec[2][1] = bezt.vec[1][1]
            bezt.auto_handle_type = HD_AUTOTYPE_LOCKED_FINAL
          } else {
            /* handles should not be beyond y coord of two others */
            if (ydiff1 <= 0.0) {
              if (next.vec[1][1] < bezt.vec[2][1]) {
                bezt.vec[2][1] = next.vec[1][1]
                rightviolate = true
              }
            } else {
              if (next.vec[1][1] > bezt.vec[2][1]) {
                bezt.vec[2][1] = next.vec[1][1]
                rightviolate = true
              }
            }
          }
        }
      }
      if (leftviolate || rightviolate) {
        /* align left handle */
        assert(is_fcurve)
        /* simple 2d calculation */
        const h1_x = p2_h1[0] - p2[0]
        const h2_x = p2[0] - p2_h2[0]

        if (leftviolate) {
          p2_h2[1] = p2[1] + ((p2[1] - p2_h1[1]) / h1_x) * h2_x
        } else {
          p2_h1[1] = p2[1] + ((p2[1] - p2_h2[1]) / h2_x) * h1_x
        }
      }
    }
  }

  if (bezt.h1 == HD_VECT) {
    /* vector */
    madd_v3_v3v3fl(p2_h1, p2, dvec_a, -1.0 / 3.0)
  }
  if (bezt.h2 == HD_VECT) {
    madd_v3_v3v3fl(p2_h2, p2, dvec_b, 1.0 / 3.0)
  }

  if (
    skip_align ||
    /* When one handle is free, aligning makes no sense, see: #35952 */
    ELEM(HD_FREE, bezt.h1, bezt.h2) ||
    /* Also when no handles are aligned, skip this step. */
    (!ELEM(HD_ALIGN, bezt.h1, bezt.h2) &&
      !ELEM(HD_ALIGN_DOUBLESIDE, bezt.h1, bezt.h2))
  ) {
    /* Handles need to be updated during animation and applying stuff like hooks,
     * but in such situations it's quite difficult to distinguish in which order
     * align handles should be aligned so skip them for now. */
    return
  }

  len_a = len_v3v3(p2, p2_h1)
  len_b = len_v3v3(p2, p2_h2)

  if (len_a == 0.0) {
    len_a = 1.0
  }
  if (len_b == 0.0) {
    len_b = 1.0
  }

  const len_ratio = len_a / len_b

  if (bezt.f1 & handle_sel_flag) {
    /* order of calculation */
    if (ELEM(bezt.h2, HD_ALIGN, HD_ALIGN_DOUBLESIDE)) {
      /* aligned */
      if (len_a > eps) {
        len = 1.0 / len_ratio
        p2_h2[0] = p2[0] + len * (p2[0] - p2_h1[0])
        p2_h2[1] = p2[1] + len * (p2[1] - p2_h1[1])
        p2_h2[2] = p2[2] + len * (p2[2] - p2_h1[2])
      }
    }
    if (ELEM(bezt.h1, HD_ALIGN, HD_ALIGN_DOUBLESIDE)) {
      if (len_b > eps) {
        len = len_ratio
        p2_h1[0] = p2[0] + len * (p2[0] - p2_h2[0])
        p2_h1[1] = p2[1] + len * (p2[1] - p2_h2[1])
        p2_h1[2] = p2[2] + len * (p2[2] - p2_h2[2])
      }
    }
  } else {
    if (ELEM(bezt.h1, HD_ALIGN, HD_ALIGN_DOUBLESIDE)) {
      if (len_b > eps) {
        len = len_ratio
        p2_h1[0] = p2[0] + len * (p2[0] - p2_h2[0])
        p2_h1[1] = p2[1] + len * (p2[1] - p2_h2[1])
        p2_h1[2] = p2[2] + len * (p2[2] - p2_h2[2])
      }
    }
    if (ELEM(bezt.h2, HD_ALIGN, HD_ALIGN_DOUBLESIDE)) {
      /* aligned */
      if (len_a > eps) {
        len = 1.0 / len_ratio
        p2_h2[0] = p2[0] + len * (p2[0] - p2_h1[0])
        p2_h2[1] = p2[1] + len * (p2[1] - p2_h1[1])
        p2_h2[2] = p2[2] + len * (p2[2] - p2_h1[2])
      }
    }
  }

  //#undef p2_h1
  //#undef p2_h2
}
function is_free_auto_point(bezt: BezTriple) {
  return BEZT_IS_AUTOH(bezt) && bezt.auto_handle_type == HD_AUTOTYPE_NORMAL
}
