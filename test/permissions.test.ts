import { describe, it, expect } from 'vitest'
import {
  effectiveMailboxLevel,
  effectiveContactsLevel,
  anyContactsLevel,
  canSendFrom,
  canReadMailbox,
  accessibleMailboxIds,
} from '../src/lib/permissions'
import type { PermissionGrant, Mailbox } from '../src/types'

const mailboxes: Mailbox[] = [
  { id: 1, email: 'support@a.com', name: 'Support', sender_name: null, domain_id: 10, cf_rule_id: null },
  { id: 2, email: 'sales@a.com', name: 'Sales', sender_name: null, domain_id: 10, cf_rule_id: null },
  { id: 3, email: 'info@b.com', name: 'Info', sender_name: null, domain_id: 20, cf_rule_id: null },
]

describe('permissions - admin', () => {
  const permissions: PermissionGrant[] = []

  it('admin has edit on any mailbox', () => {
    expect(effectiveMailboxLevel(permissions, true, 1, 10)).toBe('edit')
  })

  it('admin can send from any mailbox', () => {
    expect(canSendFrom(permissions, true, 1, 10)).toBe(true)
  })

  it('admin can read any mailbox', () => {
    expect(canReadMailbox(permissions, true, 1, 10)).toBe(true)
  })

  it('admin has edit contacts access', () => {
    expect(anyContactsLevel(permissions, true)).toBe('edit')
  })

  it('admin sees all mailboxes', () => {
    expect(accessibleMailboxIds(permissions, true, mailboxes)).toEqual([1, 2, 3])
  })
})

describe('permissions - domain-level grant', () => {
  const permissions: PermissionGrant[] = [
    { resource_type: 'domain', resource_id: 10, level: 'edit' },
  ]

  it('edit on domain grants edit on mailbox in that domain', () => {
    expect(effectiveMailboxLevel(permissions, false, 1, 10)).toBe('edit')
    expect(effectiveMailboxLevel(permissions, false, 2, 10)).toBe('edit')
  })

  it('no access to mailbox in other domain', () => {
    expect(effectiveMailboxLevel(permissions, false, 3, 20)).toBeNull()
  })

  it('can send from mailboxes in domain', () => {
    expect(canSendFrom(permissions, false, 1, 10)).toBe(true)
  })

  it('cannot send from other domain', () => {
    expect(canSendFrom(permissions, false, 3, 20)).toBe(false)
  })

  it('sees only mailboxes in granted domain', () => {
    expect(accessibleMailboxIds(permissions, false, mailboxes)).toEqual([1, 2])
  })
})

describe('permissions - mailbox-level grant', () => {
  const permissions: PermissionGrant[] = [
    { resource_type: 'mailbox', resource_id: 1, level: 'read' },
  ]

  it('read on specific mailbox', () => {
    expect(effectiveMailboxLevel(permissions, false, 1, 10)).toBe('read')
  })

  it('can read but not send', () => {
    expect(canReadMailbox(permissions, false, 1, 10)).toBe(true)
    expect(canSendFrom(permissions, false, 1, 10)).toBe(false)
  })

  it('no access to other mailboxes', () => {
    expect(effectiveMailboxLevel(permissions, false, 2, 10)).toBeNull()
  })
})

describe('permissions - hierarchy (domain + mailbox)', () => {
  const permissions: PermissionGrant[] = [
    { resource_type: 'domain', resource_id: 10, level: 'read' },
    { resource_type: 'mailbox', resource_id: 1, level: 'edit' },
  ]

  it('mailbox edit overrides domain read', () => {
    expect(effectiveMailboxLevel(permissions, false, 1, 10)).toBe('edit')
  })

  it('other mailbox in domain still gets domain-level read', () => {
    expect(effectiveMailboxLevel(permissions, false, 2, 10)).toBe('read')
  })
})

describe('permissions - contacts access', () => {
  it('no permissions = no contacts access', () => {
    expect(anyContactsLevel([], false)).toBeNull()
  })

  it('domain grant implies contacts access', () => {
    const p: PermissionGrant[] = [{ resource_type: 'domain', resource_id: 10, level: 'read' }]
    expect(anyContactsLevel(p, false)).toBe('read')
  })

  it('contacts grant gives contacts access', () => {
    const p: PermissionGrant[] = [{ resource_type: 'contacts', resource_id: 10, level: 'edit' }]
    expect(anyContactsLevel(p, false)).toBe('edit')
  })

  it('highest level wins', () => {
    const p: PermissionGrant[] = [
      { resource_type: 'contacts', resource_id: 10, level: 'read' },
      { resource_type: 'domain', resource_id: 20, level: 'edit' },
    ]
    expect(anyContactsLevel(p, false)).toBe('edit')
  })
})

describe('permissions - zero permissions non-admin', () => {
  it('has no access to anything', () => {
    expect(effectiveMailboxLevel([], false, 1, 10)).toBeNull()
    expect(canSendFrom([], false, 1, 10)).toBe(false)
    expect(canReadMailbox([], false, 1, 10)).toBe(false)
    expect(anyContactsLevel([], false)).toBeNull()
    expect(accessibleMailboxIds([], false, mailboxes)).toEqual([])
  })
})
