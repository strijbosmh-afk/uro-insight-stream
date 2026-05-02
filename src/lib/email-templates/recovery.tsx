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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>{siteName.toUpperCase()}</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Account · Recovery</Text>
          <Heading style={styles.h1}>Reset your password</Heading>
          <Text style={styles.text}>
            We received a request to reset your {siteName} password. Choose a
            new password using the link below.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Reset password →
          </Button>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            Didn't request this? You can ignore the message — your password
            won't change.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>
          {siteName} · sent via notify.urofeed.com
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
