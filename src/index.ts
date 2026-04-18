import { Hono } from 'hono'
import type { AppEnv, Bindings } from './types'
import { authRoutes } from './routes/auth'
import { inboxRoutes } from './routes/inbox'
import { conversationRoutes } from './routes/conversation'
import { customerRoutes } from './routes/customers'
import { organizationRoutes } from './routes/organizations'
import { tagRoutes } from './routes/tags'
import { auditRoutes } from './routes/audit'
import { settingsRoutes } from './routes/settings'
import { apiRoutes } from './routes/api'
import { authMiddleware } from './middleware/auth'
import { emailHandler } from './email-handler'
import { trackingRoutes } from './routes/tracking'

const app = new Hono<AppEnv>()

// Public routes
app.route('/auth', authRoutes)
app.route('/t', trackingRoutes)

// All other routes require a session
app.use('/*', authMiddleware)
app.route('/', inboxRoutes)
app.route('/c', conversationRoutes)
app.route('/customers', customerRoutes)
app.route('/organizations', organizationRoutes)
app.route('/tags', tagRoutes)
app.route('/audit', auditRoutes)
app.route('/settings', settingsRoutes)
app.route('/api/v1', apiRoutes)

export default {
  fetch: app.fetch,
  email: emailHandler,
} satisfies ExportedHandler<Bindings>
