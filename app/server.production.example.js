import express from 'express'

const app = express()
app.use(express.json({ limit: '64kb' }))

app.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'void-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  })
})

app.get('/readyz', (_req, res) => {
  // Add checks for Redis / Supabase / queue / relay registry
  res.status(200).json({ ok: true })
})

app.listen(process.env.PORT || 3500, () => {
  console.log(`VØID API listening on ${process.env.PORT || 3500}`)
})
