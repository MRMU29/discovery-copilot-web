import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { REQUIRED_PARENT } from '@/services/ost'
import { OST_NODE_TYPES } from '@/schemas/entities'
import { requiredParentType } from '@/pages/project/ost/ost-meta'

/**
 * §5.3 chain rules live in two places: the service write path (REQUIRED_PARENT)
 * and the UI parent picker (requiredParentType). Keep them from drifting apart.
 */
describe('OST parent chain rules stay in sync', () => {
  it('UI requiredParentType matches the service rule for every node type', () => {
    for (const type of OST_NODE_TYPES) {
      const expected = type === 'outcome' ? null : REQUIRED_PARENT[type]
      expect(requiredParentType(type), type).toBe(expected)
    }
  })
})
