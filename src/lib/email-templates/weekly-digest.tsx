import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { styles, theme } from './_theme'
import type { TemplateEntry } from './registry'

export interface DigestTweetItem {
  id: string
  text: string
  author_handle: string
  author_display_name?: string | null
  created_at: string
  like_count: number
  retweet_count: number
  reply_count: number
}

export interface DigestSourceGroup {
  source_id: string
  display_name: string
  handle: string
  tweets: DigestTweetItem[]
}

export interface WeeklyDigestProps {
  digestName?: string
  windowStart?: string
  windowEnd?: string
  totalTweets?: number
  groups?: DigestSourceGroup[]
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function tweetUrl(handle: string, id: string) {
  return `https://x.com/${handle}/status/${id}`
}

const WeeklyDigestEmail = ({
  digestName = 'Weekly digest',
  windowStart,
  windowEnd,
  totalTweets = 0,
  groups = [],
}: WeeklyDigestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {digestName} — {totalTweets} posts from {groups.length} sources
    </Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>UROFEED</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Digest · {digestName}</Text>
          <Heading style={styles.h1}>Your urology feed digest</Heading>
          <Text style={styles.muted}>
            {fmtDate(windowStart)} → {fmtDate(windowEnd)} · {totalTweets} posts
            from {groups.length} {groups.length === 1 ? 'source' : 'sources'}
          </Text>

          {groups.length === 0 && (
            <Text style={styles.text}>
              No new posts from your selected sources in this window.
            </Text>
          )}

          {groups.map((g) => (
            <Section key={g.source_id} style={sourceBlock}>
              <Text style={sourceHeader}>
                {g.display_name}{' '}
                <Link href={`https://x.com/${g.handle}`} style={handleLink}>
                  @{g.handle}
                </Link>
              </Text>
              {g.tweets.map((t) => (
                <Section key={t.id} style={tweetBlock}>
                  <Text style={tweetText}>{t.text}</Text>
                  <Text style={tweetMeta}>
                    ♥ {t.like_count} · ↻ {t.retweet_count} · 💬 {t.reply_count}
                    {' · '}
                    <Link href={tweetUrl(t.author_handle, t.id)} style={styles.link}>
                      open on X
                    </Link>
                  </Text>
                </Section>
              ))}
            </Section>
          ))}

          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            Manage or pause this digest in your UroFeed dashboard.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>
          UroFeed · sent via notify.urofeed.com
        </Text>
      </Container>
    </Body>
  </Html>
)

const sourceBlock = {
  borderTop: `1px solid ${theme.border}`,
  paddingTop: '16px',
  marginTop: '16px',
}

const sourceHeader = {
  fontFamily: theme.bodyFont,
  fontSize: '13px',
  fontWeight: 600 as const,
  color: theme.textPrimary,
  margin: '0 0 12px',
  letterSpacing: '0.01em',
}

const handleLink = {
  color: theme.textMuted,
  fontFamily: theme.monoFont,
  fontWeight: 400 as const,
  fontSize: '12px',
  textDecoration: 'none',
  marginLeft: '6px',
}

const tweetBlock = {
  backgroundColor: theme.panelElevated,
  border: `1px solid ${theme.border}`,
  borderRadius: '4px',
  padding: '12px 14px',
  margin: '0 0 10px',
}

const tweetText = {
  fontFamily: theme.bodyFont,
  fontSize: '13px',
  color: theme.textPrimary,
  lineHeight: '1.55',
  margin: '0 0 8px',
  whiteSpace: 'pre-wrap' as const,
}

const tweetMeta = {
  fontFamily: theme.monoFont,
  fontSize: '10px',
  letterSpacing: '0.08em',
  color: theme.textMuted,
  margin: 0,
  textTransform: 'uppercase' as const,
}

export const template = {
  component: WeeklyDigestEmail,
  subject: (data: Record<string, unknown>) => {
    const name = typeof data?.digestName === 'string' ? data.digestName : 'Your weekly digest'
    return `${name} — UroFeed`
  },
  displayName: 'Weekly digest',
  previewData: {
    digestName: 'Prostate cancer KOLs',
    windowStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date().toISOString(),
    totalTweets: 4,
    groups: [
      {
        source_id: 'sample',
        display_name: 'Dr Example',
        handle: 'drexample',
        tweets: [
          {
            id: '1',
            text: 'Big news from #ASCO25: new ARASENS subgroup data show…',
            author_handle: 'drexample',
            author_display_name: 'Dr Example',
            created_at: new Date().toISOString(),
            like_count: 42,
            retweet_count: 7,
            reply_count: 3,
          },
        ],
      },
    ],
  },
} satisfies TemplateEntry

export default WeeklyDigestEmail