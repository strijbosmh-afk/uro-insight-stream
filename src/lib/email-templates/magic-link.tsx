import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { styles } from './_theme'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>{siteName.toUpperCase()}</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Session · Magic link</Text>
          <Heading style={styles.h1}>Your login link</Heading>
          <Text style={styles.text}>
            Tap below to sign in to {siteName}. This link will expire shortly
            for your security.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Sign in →
          </Button>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            If you didn't request this link, you can ignore this email.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>
          {siteName} · sent via notify.urofeed.com
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
