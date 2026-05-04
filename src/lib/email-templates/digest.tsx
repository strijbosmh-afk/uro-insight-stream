import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = "UroFeed"

export interface DigestTweet {
  id: string
  text: string
  author_handle: string
  author_display_name?: string | null
  created_at: string
  like_count?: number
  retweet_count?: number
}

export interface DigestSourceGroup {
  source_id: string
  display_name: string
  handle: string
  tweets: DigestTweet[]
}

export interface DigestEmailProps {
  digestName?: string
  windowLabel?: string
  groups?: DigestSourceGroup[]
  recipientEmail?: string
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const DigestEmail = ({
  digestName = 'Your weekly digest',
  windowLabel = 'Recent activity',
  groups = [],
}: DigestEmailProps) => {
  const totalTweets = groups.reduce((acc, g) => acc + g.tweets.length, 0)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${digestName} — ${totalTweets} highlights from your sources`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{digestName}</Heading>
          <Text style={meta}>{SITE_NAME} · {windowLabel} · {totalTweets} posts from {groups.length} {groups.length === 1 ? 'source' : 'sources'}</Text>
          <Hr style={hr} />
          {groups.length === 0 && (
            <Text style={text}>No new posts from your sources in this window.</Text>
          )}
          {groups.map((g) => (
            <Section key={g.source_id} style={sourceSection}>
              <Heading as="h2" style={h2}>
                {g.display_name} <span style={handleStyle}>@{g.handle}</span>
              </Heading>
              {g.tweets.map((t) => (
                <Section key={t.id} style={tweetCard}>
                  <Text style={tweetText}>{t.text}</Text>
                  <Text style={tweetMeta}>
                    {fmtDate(t.created_at)}
                    {typeof t.like_count === 'number' && ` · ♥ ${t.like_count}`}
                    {typeof t.retweet_count === 'number' && ` · ↻ ${t.retweet_count}`}
                    {' · '}
                    <Link href={`https://x.com/${g.handle}/status/${t.id}`} style={link}>
                      open
                    </Link>
                  </Text>
                </Section>
              ))}
            </Section>
          ))}
          <Hr style={hr} />
          <Text style={footer}>
            Sent by {SITE_NAME}. Manage this digest in your account settings.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DigestEmail,
  subject: (data: Record<string, any>) =>
    data?.digestName ? `${data.digestName}` : 'Your UroFeed digest',
  displayName: 'Source digest',
  previewData: {
    digestName: 'AUA key opinion leaders weekly',
    windowLabel: 'Last 7 days',
    groups: [
      {
        source_id: 'urotoday',
        display_name: 'UroToday',
        handle: 'urotoday',
        tweets: [
          {
            id: '1234567890',
            text: 'New ASCO-GU data on enzalutamide + 177Lu-PSMA in mHSPC: improved rPFS but mature OS pending.',
            author_handle: 'urotoday',
            created_at: new Date().toISOString(),
            like_count: 42,
            retweet_count: 12,
          },
        ],
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '640px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 6px' }
const h2 = { fontSize: '15px', fontWeight: 600 as const, color: '#0f172a', margin: '24px 0 8px' }
const handleStyle = { color: '#64748b', fontWeight: 400 as const, fontSize: '13px' }
const meta = { fontSize: '12px', color: '#64748b', margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: 1.5 }
const sourceSection = { margin: '0 0 8px' }
const tweetCard = {
  padding: '12px 14px',
  margin: '0 0 8px',
  borderLeft: '3px solid #0ea5e9',
  background: '#f8fafc',
}
const tweetText = { fontSize: '14px', color: '#0f172a', lineHeight: 1.5, margin: '0 0 6px' }
const tweetMeta = { fontSize: '11px', color: '#64748b', margin: 0 }
const link = { color: '#0ea5e9', textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const footer = { fontSize: '11px', color: '#94a3b8', margin: '12px 0 0' }