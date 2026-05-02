import * as React from 'react'

import {
  Body,
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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={styles.main}>
      <Container style={styles.outer}>
        <Text style={styles.brandBar}>
          <span style={styles.brandAccent}>UROFEED</span>
          {' · CLINICAL CONGRESS INTELLIGENCE'}
        </Text>
        <Section style={styles.panel}>
          <Hr style={styles.accentRule} />
          <Text style={styles.eyebrow}>Security · Verification code</Text>
          <Heading style={styles.h1}>Confirm it's you</Heading>
          <Text style={styles.text}>
            Enter the verification code below to continue:
          </Text>
          <Text style={styles.code}>{token}</Text>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            This code expires shortly. If you didn't request it, ignore this
            email.
          </Text>
        </Section>
        <Text style={styles.outerFooter}>UroFeed · sent via notify.urofeed.com</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
