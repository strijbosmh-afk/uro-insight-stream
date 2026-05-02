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
import { styles, theme } from './_theme'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>{siteName.toUpperCase()}</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Account · Verification</Text>
          <Heading style={styles.h1}>Confirm your email</Heading>
          <Text style={styles.text}>
            Thanks for signing up for{' '}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            . Confirm{' '}
            <Link href={`mailto:${recipient}`} style={styles.link}>
              {recipient}
            </Link>{' '}
            to activate your access.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Verify email →
          </Button>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            If you didn't create an account, you can ignore this message.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>
          {siteName} · sent via notify.urofeed.com
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

// silence unused warning
void theme
