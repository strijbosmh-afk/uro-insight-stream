// SYNTHETIC mock data — generated for UroFeed development.
// Handles, names, quotes, and statistics are fictional. No real patient data.

import type { Source, Hashtag, Congress, Session, Abstract, Tweet, Summary } from "@/types";

export const mockSessions: Session[] = [
  {
    "id": "sess_001",
    "congressId": "cong_eau26",
    "title": "PSMA-PET in Biochemical Recurrence: State of the Art",
    "track": "Onco-urology",
    "room": "Room N112",
    "startTime": "2026-03-23T10:30:00.000Z",
    "endTime": "2026-03-23T12:00:00.000Z",
    "chairs": [
      "Prof. Helena Wirth",
      "Dr. Elena Russo"
    ],
    "abstractIds": [
      "abs_006"
    ]
  },
  {
    "id": "sess_002",
    "congressId": "cong_eau26",
    "title": "Focal Therapy for Localized Prostate Cancer: Where Do We Stand?",
    "track": "Onco-urology",
    "room": "Room S201",
    "startTime": "2026-03-21T10:30:00.000Z",
    "endTime": "2026-03-21T12:00:00.000Z",
    "chairs": [
      "Dr. James O'Connor",
      "Dr. Yuki Tanaka"
    ],
    "abstractIds": [
      "abs_005"
    ]
  },
  {
    "id": "sess_003",
    "congressId": "cong_eau26",
    "title": "Adjuvant Therapy in High-Risk RCC after Nephrectomy",
    "track": "Onco-urology",
    "room": "Auditorium A",
    "startTime": "2026-03-23T11:30:00.000Z",
    "endTime": "2026-03-23T13:00:00.000Z",
    "chairs": [
      "Dr. Mei Chen",
      "Dr. Samuel Okafor"
    ],
    "abstractIds": [
      "abs_018"
    ]
  },
  {
    "id": "sess_004",
    "congressId": "cong_eau26",
    "title": "BCG-Unresponsive NMIBC: New Horizons",
    "track": "Onco-urology",
    "room": "Room S201",
    "startTime": "2026-03-20T15:30:00.000Z",
    "endTime": "2026-03-20T17:00:00.000Z",
    "chairs": [
      "Dr. James O'Connor",
      "Dr. Mei Chen"
    ],
    "abstractIds": [
      "abs_012",
      "abs_022",
      "abs_027",
      "abs_028",
      "abs_043"
    ]
  },
  {
    "id": "sess_005",
    "congressId": "cong_eau26",
    "title": "Neoadjuvant Strategies in MIBC",
    "track": "Onco-urology",
    "room": "Room N112",
    "startTime": "2026-03-21T14:30:00.000Z",
    "endTime": "2026-03-21T16:00:00.000Z",
    "chairs": [
      "Prof. Helena Wirth",
      "Dr. Alex Moreno"
    ],
    "abstractIds": [
      "abs_016",
      "abs_029"
    ]
  },
  {
    "id": "sess_006",
    "congressId": "cong_eau26",
    "title": "Active Surveillance in 2026: Refining Selection",
    "track": "Onco-urology",
    "room": "Hall 4",
    "startTime": "2026-03-23T15:30:00.000Z",
    "endTime": "2026-03-23T17:00:00.000Z",
    "chairs": [
      "Dr. Yuki Tanaka",
      "Dr. Lena Kovács"
    ],
    "abstractIds": [
      "abs_010",
      "abs_020",
      "abs_025",
      "abs_032",
      "abs_033"
    ]
  },
  {
    "id": "sess_007",
    "congressId": "cong_eau26",
    "title": "Sacral Neuromodulation: Long-Term Outcomes",
    "track": "Functional",
    "room": "Room E3",
    "startTime": "2026-03-20T10:30:00.000Z",
    "endTime": "2026-03-20T12:00:00.000Z",
    "chairs": [
      "Dr. Hiroshi Sato",
      "Dr. Ana Costa"
    ],
    "abstractIds": [
      "abs_019",
      "abs_037",
      "abs_044"
    ]
  },
  {
    "id": "sess_008",
    "congressId": "cong_eau26",
    "title": "OAB Pharmacotherapy Beyond Anticholinergics",
    "track": "Functional",
    "room": "Room S201",
    "startTime": "2026-03-20T09:30:00.000Z",
    "endTime": "2026-03-20T11:00:00.000Z",
    "chairs": [
      "Dr. Yuki Tanaka",
      "Dr. Lena Kovács"
    ],
    "abstractIds": [
      "abs_002",
      "abs_007",
      "abs_008",
      "abs_030",
      "abs_031"
    ]
  },
  {
    "id": "sess_009",
    "congressId": "cong_eau26",
    "title": "Urethral Bulking Agents: Renaissance or Mirage?",
    "track": "Functional",
    "room": "Plenary",
    "startTime": "2026-03-22T12:30:00.000Z",
    "endTime": "2026-03-22T14:00:00.000Z",
    "chairs": [
      "Dr. Lena Kovács",
      "Dr. Samuel Okafor"
    ],
    "abstractIds": [
      "abs_011",
      "abs_014",
      "abs_015",
      "abs_035",
      "abs_049"
    ]
  },
  {
    "id": "sess_010",
    "congressId": "cong_eau26",
    "title": "Mini-PCNL vs RIRS for 2cm Stones",
    "track": "Endourology",
    "room": "Room N112",
    "startTime": "2026-03-24T11:30:00.000Z",
    "endTime": "2026-03-24T13:00:00.000Z",
    "chairs": [
      "Dr. Hiroshi Sato",
      "Dr. Aisha Bello"
    ],
    "abstractIds": [
      "abs_034",
      "abs_041",
      "abs_042"
    ]
  },
  {
    "id": "sess_011",
    "congressId": "cong_eau26",
    "title": "Thulium Fiber Laser: Five Years On",
    "track": "Endourology",
    "room": "Hall 4",
    "startTime": "2026-03-22T10:30:00.000Z",
    "endTime": "2026-03-22T12:00:00.000Z",
    "chairs": [
      "Dr. Yuki Tanaka",
      "Dr. Samuel Okafor"
    ],
    "abstractIds": [
      "abs_017",
      "abs_036",
      "abs_046",
      "abs_050"
    ]
  },
  {
    "id": "sess_012",
    "congressId": "cong_eau26",
    "title": "Steinstrasse Prevention Strategies",
    "track": "Endourology",
    "room": "Hall 4",
    "startTime": "2026-03-23T10:30:00.000Z",
    "endTime": "2026-03-23T12:00:00.000Z",
    "chairs": [
      "Dr. Karim Haddad",
      "Dr. Yuki Tanaka"
    ],
    "abstractIds": [
      "abs_003",
      "abs_026",
      "abs_045"
    ]
  },
  {
    "id": "sess_013",
    "congressId": "cong_eau26",
    "title": "Microsurgical Varicocelectomy Outcomes",
    "track": "Andrology",
    "room": "Auditorium A",
    "startTime": "2026-03-20T11:30:00.000Z",
    "endTime": "2026-03-20T13:00:00.000Z",
    "chairs": [
      "Dr. Hiroshi Sato",
      "Dr. Marco Lin"
    ],
    "abstractIds": [
      "abs_013",
      "abs_021",
      "abs_038",
      "abs_039",
      "abs_048"
    ]
  },
  {
    "id": "sess_014",
    "congressId": "cong_eau26",
    "title": "Testosterone Therapy and Cardiovascular Safety",
    "track": "Andrology",
    "room": "Plenary",
    "startTime": "2026-03-22T11:30:00.000Z",
    "endTime": "2026-03-22T13:00:00.000Z",
    "chairs": [
      "Dr. James O'Connor",
      "Dr. Léa Dubois"
    ],
    "abstractIds": [
      "abs_001",
      "abs_004",
      "abs_023",
      "abs_047"
    ]
  },
  {
    "id": "sess_015",
    "congressId": "cong_eau26",
    "title": "Penile Prosthesis: Patient-Reported Outcomes",
    "track": "Andrology",
    "room": "Room E3",
    "startTime": "2026-03-22T09:30:00.000Z",
    "endTime": "2026-03-22T11:00:00.000Z",
    "chairs": [
      "Dr. Aisha Bello",
      "Dr. Mei Chen"
    ],
    "abstractIds": [
      "abs_009",
      "abs_024",
      "abs_040"
    ]
  }
];
