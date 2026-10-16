import { format, isValid, parse } from 'date-fns';
import { CalendarIcon, ClockIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type DateTimeMode = 'date' | 'time' | 'datetime';

interface DateTimePickerProps {
  'data-testid': string;
  mode: DateTimeMode;
  /** `YYYY-MM-DD` (date), `HH:mm` (time) or `YYYY-MM-DDTHH:mm` (datetime); null = empty. */
  value: string | null;
  onChange(value: string | null): void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

const DATE_FORMAT = 'yyyy-MM-dd';
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

/** Splits a stored value into its date and time strings (either may be missing). */
function split(mode: DateTimeMode, value: string | null) {
  if (!value) return { date: '', time: '' };
  if (mode === 'date') return { date: value, time: '' };
  if (mode === 'time') return { date: '', time: value };
  const [date = '', time = ''] = value.split('T');
  return { date, time };
}

function toDate(date: string) {
  const parsed = parse(date, DATE_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

function label(mode: DateTimeMode, value: string | null) {
  const { date, time } = split(mode, value);
  const day = date && toDate(date);
  const dayText = day ? format(day, 'dd/MM/yyyy') : '';
  return [dayText, time].filter(Boolean).join(' ');
}

/** One picker for dates, times and both; stores plain strings so API formats never change. */
export function DateTimePicker({
  'data-testid': testId,
  mode,
  value,
  onChange,
  placeholder = 'Selecionar',
  disabled,
  clearable = true,
  id,
  'aria-label': ariaLabel,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const { date, time } = split(mode, value);
  const [hour = '', minute = ''] = time.split(':');
  const text = label(mode, value);

  // Missing halves default to today / 00:00 so a datetime is always complete.
  const emit = (nextDate: string, nextHour: string, nextMinute: string) => {
    const t = `${nextHour || '00'}:${nextMinute || '00'}`;
    if (mode === 'date') onChange(nextDate);
    else if (mode === 'time') onChange(t);
    else onChange(`${nextDate || format(new Date(), DATE_FORMAT)}T${t}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid={testId}
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}${text ? `: ${text}` : ''}` : undefined}
          className={cn(
            'h-11 w-full justify-start font-normal',
            !text && 'text-muted-foreground',
            className,
          )}
        >
          {mode === 'time' ? <ClockIcon /> : <CalendarIcon />}
          <span className="min-w-0 truncate">{text || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-3">
        {mode !== 'time' && (
          <Calendar
            data-testid={`${testId}-calendar`}
            mode="single"
            selected={toDate(date)}
            defaultMonth={toDate(date)}
            onSelect={(day) => {
              if (!day) return;
              emit(format(day, DATE_FORMAT), hour, minute);
              if (mode === 'date') setOpen(false);
            }}
          />
        )}
        {mode !== 'date' && (
          <div className="flex items-center gap-2">
            <Select value={hour} onValueChange={(h) => emit(date, h, minute)}>
              <SelectTrigger
                data-testid={`${testId}-hour`}
                aria-label="Hora"
                className="h-11 flex-1"
              >
                <SelectValue placeholder="HH" />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem data-testid={`${testId}-hour-${h}`} key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden="true">:</span>
            <Select value={minute} onValueChange={(m) => emit(date, hour, m)}>
              <SelectTrigger
                data-testid={`${testId}-minute`}
                aria-label="Minuto"
                className="h-11 flex-1"
              >
                <SelectValue placeholder="mm" />
              </SelectTrigger>
              <SelectContent>
                {MINUTES.map((m) => (
                  <SelectItem data-testid={`${testId}-minute-${m}`} key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex justify-between gap-2">
          {clearable && value ? (
            <Button
              data-testid={`${testId}-clear`}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <XIcon /> Limpar
            </Button>
          ) : (
            <span />
          )}
          {mode !== 'date' && (
            <Button
              data-testid={`${testId}-done`}
              type="button"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Concluir
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
