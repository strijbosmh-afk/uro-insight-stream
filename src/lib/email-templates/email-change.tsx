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

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>{siteName.toUpperCase()}</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Account · Email change</Text>
          <Heading style={styles.h1}>Confirm your new email</Heading>
          <Text style={styles.text}>
            You requested to change your {siteName} email from{' '}
            <Link href={`mailto:${oldEmail}`} style={styles.link}>
              {oldEmail}
            </Link>{' '}
            to{' '}
            <Link href={`mailto:${newEmail}`} style={styles.link}>
              {newEmail}
            </Link>
            .
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Confirm change →
          </Button>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            If you didn't request this change, secure your account immediately.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>
          {siteName} · sent via notify.urofeed.com
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
