import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ScoredGame } from '../../../../../packages/core/src/models';
import { MetadataBadge, type MetadataKind } from '../metadata';

export interface GameDetailTagsProps {
  game: Pick<
    ScoredGame,
    'status' | 'primaryGenre' | 'secondaryTags' | 'pace' | 'structure' | 'coop'
  >;
  className?: string;
  testIdPrefix?: string;
}

interface TagItem {
  key: string;
  kind: MetadataKind;
  value: string;
}

export function GameDetailTags({
  game,
  className = '',
  testIdPrefix = 'detail-badge',
}: GameDetailTagsProps) {
  const tags: TagItem[] = [];

  if (game.status) {
    tags.push({ key: `status-${game.status}`, kind: 'status', value: game.status });
  }
  if (game.primaryGenre) {
    tags.push({ key: `genre-${game.primaryGenre}`, kind: 'genre', value: game.primaryGenre });
  }
  for (const tag of game.secondaryTags ?? []) {
    if (tag) {
      tags.push({ key: `tag-${tag}`, kind: 'tag', value: tag });
    }
  }
  if (game.pace && game.pace.trim()) {
    tags.push({ key: `pace-${game.pace}`, kind: 'pace', value: game.pace });
  }
  if (game.structure && game.structure.trim()) {
    tags.push({ key: `structure-${game.structure}`, kind: 'structure', value: game.structure });
  }
  if (game.coop && game.coop.trim()) {
    tags.push({ key: `coop-${game.coop}`, kind: 'tag', value: game.coop });
  }

  const overflowCount = tags.length - 3;

  return (
    <div className={className}>
      {/* Desktop: show all tags */}
      <div className="hidden sm:flex flex-wrap gap-1.5" data-testid={`${testIdPrefix}-tags`}>
        {tags.map((t) => (
          <MetadataBadge key={t.key} kind={t.kind} value={t.value} />
        ))}
      </div>

      {/* Mobile: first 3 tags, then +X popover button if > 3 */}
      <div
        className="flex sm:hidden flex-wrap items-center gap-1.5"
        data-testid={`${testIdPrefix}-tags-mobile`}
      >
        {(overflowCount > 0 ? tags.slice(0, 3) : tags).map((t) => (
          <MetadataBadge key={t.key} kind={t.kind} value={t.value} />
        ))}
        {overflowCount > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid={`${testIdPrefix}-tags-overflow`}
                className="badge cursor-pointer inline-flex items-center justify-center rounded-full border border-border bg-muted/80 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label={`Ver mais ${overflowCount} tags`}
              >
                {'+' + overflowCount}
              </button>
            </PopoverTrigger>
            <PopoverContent
              data-testid={`${testIdPrefix}-tags-popover`}
              className="w-72 max-w-[calc(100vw-2rem)] p-3"
              align="start"
            >
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <MetadataBadge key={t.key} kind={t.kind} value={t.value} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
