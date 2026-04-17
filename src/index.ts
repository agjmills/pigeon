import { Hono } from 'hono'
import type { AppEnv, Bindings } from './types'
import { authRoutes } from './routes/auth'
import { inboxRoutes } from './routes/inbox'
import { conversationRoutes } from './routes/conversation'
import { customerRoutes } from './routes/customers'
import { organizationRoutes } from './routes/organizations'
import { tagRoutes } from './routes/tags'
import { authMiddleware } from './middleware/auth'
import { emailHandler } from './email-handler'

const app = new Hono<AppEnv>()

// Public auth routes
app.route('/auth', authRoutes)

// All other routes require a session
app.use('/*', authMiddleware)
app.route('/', inboxRoutes)
app.route('/c', conversationRoutes)
app.route('/customers', customerRoutes)
app.route('/organizations', organizationRoutes)
app.route('/tags', tagRoutes)

export default {
  fetch: app.fetch,
  email: emailHandler,
} satisfies ExportedHandler<Bindings>
