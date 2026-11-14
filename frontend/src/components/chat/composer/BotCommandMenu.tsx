import type { BotCommandInfo } from "../../../types";
import { normalizeCommand } from "./model";

/**
 * Web K `/command` autocomplete: one floating list above the plate, 50 px rows,
 * command name (bold) plus description (secondary), 207 px max height.
 * Keyboard state (active row) stays in the composer.
 */
export function BotCommandMenu({
  commands,
  activeIndex,
  label,
  onHover,
  onSelect,
}: {
  commands: BotCommandInfo[];
  activeIndex: number;
  label: string;
  onHover: (index: number) => void;
  onSelect: (command: BotCommandInfo) => void;
}) {
  return (
    <div
      className="tg-composer__commands"
      role="listbox"
      aria-label={label}
      data-composer-popover
    >
      {commands.map((command, index) => {
        const name = normalizeCommand(command.command);
        return (
          <button
            key={`${name}-${index}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className="tg-composer__command"
            data-active={index === activeIndex ? true : undefined}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(command)}
          >
            <span className="tg-composer__command-name">/{name}</span>
            {command.description ? (
              <span className="tg-composer__command-desc">
                {command.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
