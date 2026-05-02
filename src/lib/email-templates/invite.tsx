import * as React from 'react'

import {
  Body,
  Button,
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
import { styles } from './_theme'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>{siteName.toUpperCase()}</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Team · Invitation</Text>
          <Heading style={styles.h1}>You've been invited</Heading>
          <Text style={styles.text}>
            You've been invited to join{' '}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            . Accept the invitation to create your account and get access to
            the live congress feed.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Accept invitation →
          </Button>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            If you weren't expecting this invitation, you can ignore it.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>
          {siteName} · sent via notify.urofeed.com
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
