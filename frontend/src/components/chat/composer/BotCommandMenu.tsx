import { Avatar } from "../../../ui";
import type { BotCommandInfo } from "../../../types";
import { normalizeCommand } from "./model";

export interface CommandAvatarInfo {
  title: string;
  initials: string;
  color: string;
  seed?: string;
  photo?: string;
}

/**
 * Web K `/command` autocomplete: one floating list rising out of the plate
 * (`bottom: calc(100% - 24px)`, sides −8px, radius 24 24 0 0, max-height 207px),
 * 50px rows with the owning bot's 30px avatar at 12px and a two-line
 * name/description column at 54px (tweb `_chatBotCommands.scss`,
 * `_autocompletePeerHelper.scss`, `botCommands.ts:36-44`).
 */
export function BotCommandMenu({
  commands,
  activeIndex,
  label,
  getAvatar,
  onHover,
  onSelect,
}: {
  commands: BotCommandInfo[];
  activeIndex: number;
  label: string;
  getAvatar: (command: BotCommandInfo) => CommandAvatarInfo;
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
      <div className="tg-composer__commands-list">
        {commands.map((command, index) => {
          const name = normalizeCommand(command.command);
          const avatar = getAvatar(command);
          return (
            <button
              key={`${name}-${avatar.title}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className="tg-composer__command"
              data-active={index === activeIndex ? true : undefined}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(command)}
            >
              <span className="tg-composer__command-avatar">
                <Avatar
                  title={avatar.title}
                  initials={avatar.initials}
                  color={avatar.color}
                  seed={avatar.seed}
                  photo={avatar.photo}
                  size={30}
                />
              </span>
              <span className="tg-composer__command-copy">
                <span className="tg-composer__command-name">/{name}</span>
                {command.description ? (
                  <span className="tg-composer__command-desc">
                    {command.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
