# Metadados dos jogos

`game-metadata.json` traz um registro por jogo de `api/src/seed.ts` (481 no total, `gameId` = `id` do seed). Os dados foram coletados em 11/10/2026.

## Cobertura

| Campo | Jogos |
|---|---|
| Fonte Steam (appdetails/CDN) | 469 |
| `coverUrl` (capa vertical) | 472 |
| `headerUrl` | 475 |
| `heroUrl` | 473 |
| `shortDescription` / `description` | 481 / 481 |
| Descrição em pt-BR / en | 327 / 154 |
| `screenshots` (máx. 8) | 471 |
| `trailers` | 434 |
| Confiança high / medium / low | 469 / 12 / 0 |

## Fontes
- **Steam**: `appdetails` (`l=brazilian`) e `IStoreBrowseService/GetItems` para obter as URLs das capas (`library_600x900`) e do `library_hero`. Só 80 jogos já tinham `steamAppId` no seed. Para os outros 401, o appId foi descoberto pelo `storesearch`, aceitando só nome exato ou igual a menos da edição. Outros 54 foram resolvidos manualmente (veja `notes`). O `steamAppId` do JSON traz esse appId descoberto, então não é o mesmo valor do seed.
- **Wikipedia/Wikidata**: Blood Omen: Legacy of Kain, Dauntless, Madden NFL 22, Medal of Honor: Pacific Assault, Star Wars Rebellion e Clive Barker's Undying, que não estão na Steam. Também Metro: Last Light (appId 43160) e Tony Hawk's Pro Skater HD (appId 207210), que saíram de venda: o texto vem da Wikipedia e as imagens, da CDN da Steam. Esses jogos não têm screenshots.
- **Epic Games Store** (API de conteúdo): 3 out of 10 EP 1, Honkai: Star Rail, Second Extinction e Stranger Things 3: The Game.

## Confiança média (12)
São jogos em que a edição ou o título casado é diferente do nome no seed:
- Aces of the Luftwaffe - Squadron Extended Edition
- Carcassonne (Tiles & Tactics)
- Darksiders II (Deathinitive)
- Godfall Challenger Edition (dados da Ultimate)
- Grand Theft Auto V (Enhanced)
- Hitman (HITMAN 2016)
- Snakebird Complete (dados do Snakebird)
- The Falconeer (Revolution Remaster)
- TheHunter (theHunter Classic)
- Trine 4: Definitive Edition (Nightmare Prince)
- The Outer Worlds: Peril on Gorgon e Murder on Eridanos: são DLCs, com sinopse resumida de notícias e imagens do jogo base.

## Lacunas
- **Sem capa vertical (9)**: Dark Sun: Shattered Lands, Dark Sun: Wake of the Ravager, Dragons of Flame, Eye of the Beholder II, Eye of the Beholder III, Heroes of the Lance, Shadow Sorcerer, War of the Lance e GreedFall - De Vespe Conspiracy. Todos têm `headerUrl`.
- **Trailers**: a Steam hoje entrega a maioria como HLS (`.m3u8`). Para tocá-los é preciso um player com suporte a HLS, como o hls.js.
- **Imagens da Wikipedia**: as capas vêm de `upload.wikimedia.org` e podem ter uso restrito (fair use).
