function normalizeJobs(items) {
  return (Array.isArray(items) ? items : []).map(item => ({
    title: item.title ?? '',
    company: item.companyName ?? item.company ?? '',
    location: item.location ?? '',
    postedAt: item.postedAt
      ? new Date(item.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '',
    applyUrl: item.applyUrl ?? item.link ?? '',
    viewUrl: item.link ?? '',
  }))
}

export default async function handler(req, res) {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'APIFY_API_TOKEN not configured on the server.' })
  }

  // POST — start a new actor run, return runId immediately
  if (req.method === 'POST') {
    try {
      const startRes = await fetch(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/runs?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: [
              'https://www.linkedin.com/jobs/search/?keywords=Senior%20Android%20Developer&location=India&f_TPR=r604800',
            ],
          }),
        }
      )
      if (!startRes.ok) {
        const text = await startRes.text()
        throw new Error(`Apify error ${startRes.status}: ${text}`)
      }
      const data = await startRes.json()
      return res.json({ runId: data.data?.id, datasetId: data.data?.defaultDatasetId })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // GET — check run status; return jobs when done
  if (req.method === 'GET') {
    const { runId, datasetId } = req.query
    if (!runId || !datasetId) {
      return res.json({ status: 'idle' })
    }
    try {
      const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`)
      const d = await r.json()
      const status = d.data?.status ?? 'UNKNOWN'

      if (status === 'SUCCEEDED') {
        const itemsRes = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json&limit=50`
        )
        const items = await itemsRes.json()
        return res.json({ status: 'done', jobs: normalizeJobs(items) })
      }
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        return res.json({ status: 'failed', error: `Actor run ended with status: ${status}` })
      }
      return res.json({ status: 'running' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
