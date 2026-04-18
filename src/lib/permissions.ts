import type { Mailbox, PermissionLevel, UserPermission } from '../types'

function highest(a: PermissionLevel | null, b: PermissionLevel | null): PermissionLevel | null {
  if (a === 'edit' || b === 'edit') return 'edit'
  if (a === 'read' || b === 'read') return 'read'
  return null
}

export function effectiveMailboxLevel(
  permissions: UserPermission[],
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
  permissions: UserPermission[],
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
  permissions: UserPermission[],
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
  permissions: UserPermission[],
  isAdmin: boolean,
  mailboxId: number,
  domainId: number
): boolean {
  return effectiveMailboxLevel(permissions, isAdmin, mailboxId, domainId) === 'edit'
}

export function canReadMailbox(
  permissions: UserPermission[],
  isAdmin: boolean,
  mailboxId: number,
  domainId: number
): boolean {
  return effectiveMailboxLevel(permissions, isAdmin, mailboxId, domainId) !== null
}

export function accessibleMailboxIds(
  permissions: UserPermission[],
  isAdmin: boolean,
  allMailboxes: Mailbox[]
): number[] {
  if (isAdmin) return allMailboxes.map(mb => mb.id)
  return allMailboxes
    .filter(mb => mb.domain_id !== null && canReadMailbox(permissions, isAdmin, mb.id, mb.domain_id))
    .map(mb => mb.id)
}
