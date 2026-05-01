// SYNTHETIC mock data — generated for UroFeed development.
// Handles, names, quotes, and statistics are fictional. No real patient data.

import type { Source, Hashtag, Congress, Session, Abstract, Tweet, Summary } from "@/types";

export const mockSources: Source[] = [
  {
    "id": "src_001",
    "handle": "@DrUroOnc",
    "displayName": "Dr. Alex Moreno",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=DrUroOnc",
    "role": "KOL",
    "specialty": [
      "onco-urology",
      "prostate"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_002",
    "handle": "@RoboticPelvis",
    "displayName": "Dr. Priya Rai",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=RoboticPelvis",
    "role": "KOL",
    "specialty": [
      "robotic",
      "prostate"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_003",
    "handle": "@EAU_Official",
    "displayName": "European Assoc. of Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=EAU_Official",
    "role": "society",
    "specialty": [
      "general"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_004",
    "handle": "@AUA_News",
    "displayName": "American Urological Assoc.",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=AUA_News",
    "role": "society",
    "specialty": [
      "general"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_005",
    "handle": "@SIU_Urology",
    "displayName": "Société Int. d'Urologie",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=SIU_Urology",
    "role": "society",
    "specialty": [
      "general"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_006",
    "handle": "@JUrology",
    "displayName": "The Journal of Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=JUrology",
    "role": "journal",
    "specialty": [
      "general"
    ],
    "verified": true,
    "active": false
  },
  {
    "id": "src_007",
    "handle": "@EurUrolJ",
    "displayName": "European Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=EurUrolJ",
    "role": "journal",
    "specialty": [
      "general"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_008",
    "handle": "@BJUInt",
    "displayName": "BJU International",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=BJUInt",
    "role": "journal",
    "specialty": [
      "general"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_009",
    "handle": "@UroToday",
    "displayName": "UroToday Editorial",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroToday",
    "role": "other",
    "specialty": [
      "news"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_010",
    "handle": "@ProstateProf",
    "displayName": "Prof. Helena Wirth",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=ProstateProf",
    "role": "KOL",
    "specialty": [
      "prostate"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_011",
    "handle": "@BladderBoss",
    "displayName": "Dr. Marco Lin",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=BladderBoss",
    "role": "KOL",
    "specialty": [
      "bladder"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_012",
    "handle": "@StoneSurgeon",
    "displayName": "Dr. Yuki Tanaka",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=StoneSurgeon",
    "role": "KOL",
    "specialty": [
      "endourology",
      "stones"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_013",
    "handle": "@FocalTxFan",
    "displayName": "Dr. Samuel Okafor",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=FocalTxFan",
    "role": "KOL",
    "specialty": [
      "focal",
      "prostate"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_014",
    "handle": "@UroPathDoc",
    "displayName": "Dr. Lena Kovács",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroPathDoc",
    "role": "KOL",
    "specialty": [
      "pathology"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_015",
    "handle": "@ClinicURO",
    "displayName": "Clínic Barcelona Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=ClinicURO",
    "role": "institution",
    "specialty": [
      "general"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_016",
    "handle": "@MayoUro",
    "displayName": "Mayo Clinic Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=MayoUro",
    "role": "institution",
    "specialty": [
      "general"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_017",
    "handle": "@MSK_Uro",
    "displayName": "MSK Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=MSK_Uro",
    "role": "institution",
    "specialty": [
      "onco-urology"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_018",
    "handle": "@CharitéUro",
    "displayName": "Charité Berlin Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=CharitéUro",
    "role": "institution",
    "specialty": [
      "general"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_019",
    "handle": "@IRCCS_Uro",
    "displayName": "IRCCS Milano Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=IRCCS_Uro",
    "role": "institution",
    "specialty": [
      "general"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_020",
    "handle": "@UCLHUro",
    "displayName": "UCLH Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UCLHUro",
    "role": "institution",
    "specialty": [
      "general"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_021",
    "handle": "@AndroDocPL",
    "displayName": "Dr. Tomasz Nowak",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=AndroDocPL",
    "role": "KOL",
    "specialty": [
      "andrology"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_022",
    "handle": "@FunctionalUroDr",
    "displayName": "Dr. Aisha Bello",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=FunctionalUroDr",
    "role": "KOL",
    "specialty": [
      "functional",
      "incontinence"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_023",
    "handle": "@NeuroUroMD",
    "displayName": "Dr. Hiroshi Sato",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=NeuroUroMD",
    "role": "KOL",
    "specialty": [
      "neuro-uro"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_024",
    "handle": "@PSMAExpert",
    "displayName": "Dr. Elena Russo",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=PSMAExpert",
    "role": "KOL",
    "specialty": [
      "imaging",
      "prostate"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_025",
    "handle": "@RCCsurgeon",
    "displayName": "Dr. Karim Haddad",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=RCCsurgeon",
    "role": "KOL",
    "specialty": [
      "kidney"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_026",
    "handle": "@ResidentURO",
    "displayName": "Dr. Sofia Andersson",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=ResidentURO",
    "role": "other",
    "specialty": [
      "resident"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_027",
    "handle": "@UroFellow",
    "displayName": "Dr. Daniel Park",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroFellow",
    "role": "other",
    "specialty": [
      "fellow"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_028",
    "handle": "@UroEvidence",
    "displayName": "Cochrane Urology",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroEvidence",
    "role": "other",
    "specialty": [
      "evidence"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_029",
    "handle": "@EUYUO",
    "displayName": "EAU Young Urologists",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=EUYUO",
    "role": "society",
    "specialty": [
      "young"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_030",
    "handle": "@AUARes",
    "displayName": "AUA Residents",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=AUARes",
    "role": "society",
    "specialty": [
      "residents"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_031",
    "handle": "@UroNursesNet",
    "displayName": "Uro Nurses Network",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroNursesNet",
    "role": "other",
    "specialty": [
      "nursing"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_032",
    "handle": "@BCGwatch",
    "displayName": "BCG Shortage Tracker",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=BCGwatch",
    "role": "other",
    "specialty": [
      "policy"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_033",
    "handle": "@UroPolicyEU",
    "displayName": "EU Uro Policy Group",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroPolicyEU",
    "role": "other",
    "specialty": [
      "policy"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_034",
    "handle": "@UroAIBot",
    "displayName": "UroAI Insights",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroAIBot",
    "role": "other",
    "specialty": [
      "ai"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_035",
    "handle": "@ImagingUro",
    "displayName": "Dr. Léa Dubois",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=ImagingUro",
    "role": "KOL",
    "specialty": [
      "imaging"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_036",
    "handle": "@PediatricUro",
    "displayName": "Dr. Mei Chen",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=PediatricUro",
    "role": "KOL",
    "specialty": [
      "pediatric"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_037",
    "handle": "@UroRadOnc",
    "displayName": "Dr. James O'Connor",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroRadOnc",
    "role": "KOL",
    "specialty": [
      "radonc",
      "prostate"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_038",
    "handle": "@MedOncGU",
    "displayName": "Dr. Ana Costa",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=MedOncGU",
    "role": "KOL",
    "specialty": [
      "medonc",
      "GU"
    ],
    "verified": true,
    "active": true
  },
  {
    "id": "src_039",
    "handle": "@UroTrialsHub",
    "displayName": "GU Trials Hub",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroTrialsHub",
    "role": "other",
    "specialty": [
      "trials"
    ],
    "verified": false,
    "active": true
  },
  {
    "id": "src_040",
    "handle": "@UroPodcast",
    "displayName": "The Uro Podcast",
    "avatarUrl": "https://api.dicebear.com/7.x/initials/svg?seed=UroPodcast",
    "role": "other",
    "specialty": [
      "media"
    ],
    "verified": false,
    "active": true
  }
];
