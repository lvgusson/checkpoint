# Business capability and context index

The application uses plain TypeScript models, functions, application services, and repository adapters. These are analytical documentation boundaries within one application, not evidence of independently deployed bounded contexts, enforced aggregates, value-object classes, or an event bus.

| Capability             | Document                                   | Relationship                                                                        |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Personal game library  | [Game library](game-library/domain.md)     | Shared catalogue combined with personal progress/preferences; trains prioritization |
| Play prioritization    | [Prioritization](prioritization/domain.md) | Per-list settings/pins over the same user's library; consumes library history       |
| Wishlist acquisition   | [Wishlist](wishlist/domain.md)             | Creates ordinary library games with wishlist status; enriches through Steam         |
| Identity and ownership | [Identity](identity/domain.md)             | Resolves authenticated identity to application owner across personal capabilities   |

Core/supporting/generic classifications are reasoned interpretations of code responsibilities unless separately confirmed by the business owner. Published domain events and formal aggregate-root enforcement have not been established.

Follow [the architecture index](../architecture-index.md) for technical ownership and [the domain template](../../domain-template.md) when adding a justified context. New contexts require a parent link and source evidence, not merely a directory or table.
