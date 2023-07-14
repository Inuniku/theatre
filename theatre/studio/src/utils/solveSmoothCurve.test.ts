import {toBeDeepCloseTo, toMatchCloseTo} from 'jest-matcher-deep-close-to'
expect.extend({toBeDeepCloseTo, toMatchCloseTo})
import {BKE_fcurve_handles_recalc} from './solveSmoothCurve'
import config from './test-data/test_curves.json'
describe('Theatre.js curve utils: smooth', () => {
  test.each(config.experiments)('curve %s', (...vals) => {
    const val = vals[0]

    BKE_fcurve_handles_recalc(val.in)
    return expect(val.in).toMatchCloseTo(val.out)
  })
})
