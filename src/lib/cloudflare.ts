const CF_API = 'https://api.cloudflare.com/client/v4'

async function cfFetch<T>(
  token: string,
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  })
  const data = await res.json<{ success: boolean; result: T; errors: { message: string }[] }>()
  if (!data.success) {
    throw new Error(`CF API error: ${data.errors.map(e => e.message).join(', ')}`)
  }
  return data.result
}

export async function getZoneId(token: string, domain: string): Promise<string> {
  const zones = await cfFetch<{ id: string; name: string }[]>(
    token,
    `/zones?name=${domain}&status=active`
  )
  if (!zones.length) throw new Error(`No active Cloudflare zone found for domain: ${domain}`)
  return zones[0].id
}

export async function createDnsRecord(
  token: string,
  zoneId: string,
  record: { type: string; name: string; content: string; ttl?: number; priority?: number }
): Promise<string> {
  const result = await cfFetch<{ id: string }>(token, `/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl ?? 1,
      ...(record.priority !== undefined ? { priority: record.priority } : {}),
    }),
  })
  return result.id
}

export async function deleteDnsRecord(token: string, zoneId: string, recordId: string): Promise<void> {
  await cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
}

export async function createCatchallRule(token: string, zoneId: string, workerName: string): Promise<string> {
  const rule = await cfFetch<{ id: string }>(
    token,
    `/zones/${zoneId}/email/routing/rules`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'catch-all',
        enabled: true,
        matchers: [{ type: 'all' }],
        actions: [{ type: 'worker', value: [workerName] }],
        priority: 0,
      }),
    }
  )
  return rule.id
}

export async function createRoutingRule(
  token: string,
  zoneId: string,
  address: string,
  workerName: string
): Promise<string> {
  const rule = await cfFetch<{ id: string }>(
    token,
    `/zones/${zoneId}/email/routing/rules`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: address,
        enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: address }],
        actions: [{ type: 'worker', value: [workerName] }],
      }),
    }
  )
  return rule.id
}

export async function deleteRoutingRule(
  token: string,
  zoneId: string,
  ruleId: string
): Promise<void> {
  await cfFetch(token, `/zones/${zoneId}/email/routing/rules/${ruleId}`, {
    method: 'DELETE',
  })
}
