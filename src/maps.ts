// Generado por tools/make_maps.py: no editar a mano.
import type { BuildingType, RoleId } from './data'

export interface MapDef {
  name: string
  blurb: string
  rows: string[]
  buildings: { type: BuildingType; owner: -1 | 0 | 1; x: number; y: number }[]
  starts: { role: RoleId; team: 0 | 1; x: number; y: number }[]
}

export const MAPS = [
  {
    name: "Río Central",
    blurb: "Un río con tres vados separa los dos bandos.",
    rows: [
      "TTT..T....TT.~~~~.TT....T..TTT",
      "TT....M...T..~~~~..T...M....TT",
      "T.....M......~~~~......M.....T",
      "............M.~~.M............",
      "....\"\"\".==..T.~~.T..==.\"\"\"....",
      "..==.\"\"..=....~~....=..\"\".==..",
      "T..=TT...=....ss....=...TT=..T",
      "T..=T....=====ss=====....T=..T",
      "\"\".=..M..=\"\"..~~..\"\"=..M..=.\"\"",
      "\"..=.....=...~~~~...=.....=..\"",
      "...=.....=...~~~~...=.....=...",
      "..============~~============..",
      "...=.........=~~=.........=...",
      "...=...TTM\"\".=ss=.\"\"MTT...=...",
      "...=......\"\"T.~~.T\"\"......=...",
      ".MM=.......TT.~~.TT.......=MM.",
      ".............~~~~.............",
      "T.....~~~..TT~~~~TT..~~~.....T",
      "T..\"\".~~~..M.ssss.M..~~~.\"\"..T",
      "TTT.\"\"~~~....~~~~....~~~\"\".TTT"
    ],
    buildings: [
      {
        type: "gym",
        owner: 0,
        x: 3,
        y: 10
      },
      {
        type: "center",
        owner: 0,
        x: 7,
        y: 10
      },
      {
        type: "house",
        owner: 0,
        x: 1,
        y: 13
      },
      {
        type: "house",
        owner: 0,
        x: 5,
        y: 13
      },
      {
        type: "house",
        owner: -1,
        x: 2,
        y: 4
      },
      {
        type: "mart",
        owner: -1,
        x: 8,
        y: 3
      },
      {
        type: "center",
        owner: -1,
        x: 11,
        y: 6
      },
      {
        type: "house",
        owner: -1,
        x: 3,
        y: 17
      },
      {
        type: "mart",
        owner: -1,
        x: 9,
        y: 16
      },
      {
        type: "house",
        owner: -1,
        x: 11,
        y: 10
      },
      {
        type: "gym",
        owner: 1,
        x: 26,
        y: 10
      },
      {
        type: "center",
        owner: 1,
        x: 22,
        y: 10
      },
      {
        type: "house",
        owner: 1,
        x: 27,
        y: 13
      },
      {
        type: "house",
        owner: 1,
        x: 23,
        y: 13
      },
      {
        type: "house",
        owner: -1,
        x: 26,
        y: 4
      },
      {
        type: "mart",
        owner: -1,
        x: 20,
        y: 3
      },
      {
        type: "center",
        owner: -1,
        x: 18,
        y: 6
      },
      {
        type: "house",
        owner: -1,
        x: 25,
        y: 17
      },
      {
        type: "mart",
        owner: -1,
        x: 19,
        y: 16
      },
      {
        type: "house",
        owner: -1,
        x: 17,
        y: 10
      }
    ],
    starts: [
      {
        role: "capturador",
        team: 0,
        x: 3,
        y: 11
      },
      {
        role: "explorador",
        team: 0,
        x: 4,
        y: 11
      },
      {
        role: "capturador",
        team: 1,
        x: 26,
        y: 11
      },
      {
        role: "explorador",
        team: 1,
        x: 25,
        y: 11
      }
    ]
  },
  {
    name: "Archipiélago",
    blurb: "Islas unidas por vados: los nadadores y los voladores mandan.",
    rows: [
      "~TT.......TT~~~~~~TT.......TT~",
      "~....M.....T~~~~~~T.....M....~",
      "............~~~~~~............",
      "............~~~~~~............",
      "............ssssss............",
      "..=========.~~~~~~.=========..",
      ".\".=.....=.M~~~~~~M.=.....=.\".",
      "T\".=.\"TT.=\".~~~~~~.\"=.TT\".=.\"T",
      "T..=.\"\"..=.T~~~~~~T.=..\"\".=..T",
      "~~~ss~~~~s~~~~~~~~~~s~~~~ss~~~",
      "~~~ss~~~~s~~~~~~~~~~s~~~~ss~~~",
      "T..=..\"\".=.T~~~~~~T.=.\"\"..=..T",
      "T\".=...M.=.T~~~~~~T.=.M...=.\"T",
      "...=.....=\".~~~~~~.\"=.....=...",
      ".M.=.....=\".~~~~~~.\"=.....=.M.",
      "...=.....=..ssssss..=.....=...",
      "...========.~~~~~~.========...",
      "............~~~~~~............",
      "~~..\"\"TT..MT~~~~~~TM..TT\"\"..~~",
      "~~T.\"\".T...T~~~~~~T...T.\"\".T~~"
    ],
    buildings: [
      {
        type: "gym",
        owner: 0,
        x: 3,
        y: 4
      },
      {
        type: "center",
        owner: 0,
        x: 7,
        y: 4
      },
      {
        type: "house",
        owner: 0,
        x: 10,
        y: 3
      },
      {
        type: "house",
        owner: 0,
        x: 0,
        y: 4
      },
      {
        type: "house",
        owner: -1,
        x: 7,
        y: 8
      },
      {
        type: "mart",
        owner: -1,
        x: 1,
        y: 13
      },
      {
        type: "center",
        owner: -1,
        x: 6,
        y: 15
      },
      {
        type: "house",
        owner: -1,
        x: 10,
        y: 12
      },
      {
        type: "mart",
        owner: -1,
        x: 8,
        y: 18
      },
      {
        type: "house",
        owner: -1,
        x: 1,
        y: 17
      },
      {
        type: "gym",
        owner: 1,
        x: 26,
        y: 4
      },
      {
        type: "center",
        owner: 1,
        x: 22,
        y: 4
      },
      {
        type: "house",
        owner: 1,
        x: 18,
        y: 3
      },
      {
        type: "house",
        owner: 1,
        x: 28,
        y: 4
      },
      {
        type: "house",
        owner: -1,
        x: 21,
        y: 8
      },
      {
        type: "mart",
        owner: -1,
        x: 27,
        y: 13
      },
      {
        type: "center",
        owner: -1,
        x: 23,
        y: 15
      },
      {
        type: "house",
        owner: -1,
        x: 18,
        y: 12
      },
      {
        type: "mart",
        owner: -1,
        x: 20,
        y: 18
      },
      {
        type: "house",
        owner: -1,
        x: 27,
        y: 17
      }
    ],
    starts: [
      {
        role: "capturador",
        team: 0,
        x: 3,
        y: 5
      },
      {
        role: "explorador",
        team: 0,
        x: 4,
        y: 5
      },
      {
        role: "capturador",
        team: 1,
        x: 26,
        y: 5
      },
      {
        role: "explorador",
        team: 1,
        x: 25,
        y: 5
      }
    ]
  },
  {
    name: "Bosque Viejo",
    blurb: "Bosque cerrado y hierba alta: emboscadas, fuego y poca visibilidad.",
    rows: [
      "T..T.T.\"T~~..T~~T..~~T\".T.T..T",
      ".T.\"T.T..~~T..~~..T~~..T.T\".T.",
      "TMT..T\"T..T.T\"~~\"T.T..T\"T..TMT",
      ".T....T....T.=ss=.T....T....T.",
      "....T=========~~=========T....",
      "T\".T.=..T.T..T~~T..T.T..=.T.\"T",
      "....T=T..T....~~....T..T=T....",
      "T....=.T......~~......T.=....T",
      "...\".=....\"..T~~T..\"....=.\"...",
      ".....=.......\"~~\".......=.....",
      "T....=...\"T..TssT..T\"...=....T",
      ".T============ss============T.",
      "T\"......=.T.T.~~.T.T.=......\"T",
      ".T....T.=..M.T~~T.M..=.T....T.",
      "\".T....T=T....~~....T=T....T.\"",
      "T.M..T..=....T~~T....=..T..M.T",
      ".T....T.======ss======.T....T.",
      "T.T....T=\"T.T.~~.T.T\"=T....T.T",
      ".T.T.\"~~~..T\"T~~T\"T..~~~\".T.T.",
      ".\"T.T.~~~T..T.~~.T..T~~~.T.T\"."
    ],
    buildings: [
      {
        type: "gym",
        owner: 0,
        x: 3,
        y: 10
      },
      {
        type: "center",
        owner: 0,
        x: 7,
        y: 10
      },
      {
        type: "house",
        owner: 0,
        x: 1,
        y: 7
      },
      {
        type: "house",
        owner: 0,
        x: 3,
        y: 14
      },
      {
        type: "house",
        owner: -1,
        x: 2,
        y: 4
      },
      {
        type: "mart",
        owner: -1,
        x: 8,
        y: 3
      },
      {
        type: "center",
        owner: -1,
        x: 11,
        y: 7
      },
      {
        type: "house",
        owner: -1,
        x: 11,
        y: 10
      },
      {
        type: "mart",
        owner: -1,
        x: 4,
        y: 17
      },
      {
        type: "center",
        owner: -1,
        x: 11,
        y: 15
      },
      {
        type: "gym",
        owner: 1,
        x: 26,
        y: 10
      },
      {
        type: "center",
        owner: 1,
        x: 22,
        y: 10
      },
      {
        type: "house",
        owner: 1,
        x: 27,
        y: 7
      },
      {
        type: "house",
        owner: 1,
        x: 25,
        y: 14
      },
      {
        type: "house",
        owner: -1,
        x: 26,
        y: 4
      },
      {
        type: "mart",
        owner: -1,
        x: 20,
        y: 3
      },
      {
        type: "center",
        owner: -1,
        x: 18,
        y: 7
      },
      {
        type: "house",
        owner: -1,
        x: 17,
        y: 10
      },
      {
        type: "mart",
        owner: -1,
        x: 24,
        y: 17
      },
      {
        type: "center",
        owner: -1,
        x: 18,
        y: 15
      }
    ],
    starts: [
      {
        role: "capturador",
        team: 0,
        x: 3,
        y: 11
      },
      {
        role: "explorador",
        team: 0,
        x: 4,
        y: 11
      },
      {
        role: "capturador",
        team: 1,
        x: 26,
        y: 11
      },
      {
        role: "explorador",
        team: 1,
        x: 25,
        y: 11
      }
    ]
  }
] as MapDef[]
