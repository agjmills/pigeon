import type { Mailbox, PermissionLevel, PermissionGrant } from '../types'

function highest(a: PermissionLevel | null, b: PermissionLevel | null): PermissionLevel | null {
  if (a === 'edit' || b === 'edit') return 'edit'
  if (a === 'read' || b === 'read') return 'read'
  return null
}

export function effectiveMailboxLevel(
  permissions: PermissionGrant[],
  isAdmin: boolean,
  mailboxId: number,
  domainId: number
): PermissionLevel | null {
  if (isAdmin) return 'edit'
  let level: PermissionLevel | null = null
  for (const p of permissions) {
    if (p.resource_type === 'domain' && p.resource_id === domainId) {
      level = highest(level, p.level)
    }
    if (p.resource_type === 'mailbox' && p.resource_id === mailboxId) {
      level = highest(level, p.level)
    }
  }
  return level
}

export function effectiveContactsLevel(
  permissions: PermissionGrant[],
  isAdmin: boolean,
  domainId: number
): PermissionLevel | null {
  if (isAdmin) return 'edit'
  let level: PermissionLevel | null = null
  for (const p of permissions) {
    if (p.resource_type === 'domain' && p.resource_id === domainId) {
      level = highest(level, p.level)
    }
    if (p.resource_type === 'contacts' && p.resource_id === domainId) {
      level = highest(level, p.level)
    }
  }
  return level
}

// Returns the highest contacts access the user has across any domain.
// Used for routes not yet scoped to a specific domain.
export function anyContactsLevel(
  permissions: PermissionGrant[],
  isAdmin: boolean
): PermissionLevel | null {
  if (isAdmin) return 'edit'
  let level: PermissionLevel | null = null
  for (const p of permissions) {
    if (p.resource_type === 'domain' || p.resource_type === 'contacts') {
      level = highest(level, p.level)
    }
  }
  return level
}

export function canSendFrom(
  permissions: PermissionGrant[],
  isAdmin: boolean,
  mailboxId: number,
  domainId: number
): boolean {
  return effectiveMailboxLevel(permissions, isAdmin, mailboxId, domainId) === 'edit'
}

export function canReadMailbox(
  permissions: PermissionGrant[],
  isAdmin: boolean,
  mailboxId: number,
  domainId: number
): boolean {
  return effectiveMailboxLevel(permissions, isAdmin, mailboxId, domainId) !== null
}

export function accessibleMailboxIds(
  permissions: PermissionGrant[],
  isAdmin: boolean,
  allMailboxes: Mailbox[]
): number[] {
  if (isAdmin) return allMailboxes.map(mb => mb.id)
  return allMailboxes
    .filter(mb => mb.domain_id !== null && canReadMailbox(permissions, isAdmin, mb.id, mb.domain_id))
    .map(mb => mb.id)
}
