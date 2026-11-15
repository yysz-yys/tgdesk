import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";
import { useRipple } from "./useRipple";

interface KSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  /**
   * The chat list's "old style" pill (grey plate, no ring). Super-tab headers
   * (the Stickers tab) use the default InputSearch ring: bordered, transparent
   * fill that turns accent on focus.
   */
  oldStyle?: boolean;
}

/**
 * Web K sidebar search: the 44px pill (`InputSearch`), a 24px magnifier, and a
 * clear button that appears once text is typed. The default style is the
 * bordered super-tab header field; `oldStyle` is the chat list's grey plate. On
 * focus the pill turns transparent with an accent border.
 */
export function KSearchField({
  value,
  onChange,
  onFocus,
  placeholder,
  oldStyle = true,
}: KSearchFieldProps) {
  const { t } = useTranslation();
  const clearRipple = useRipple<HTMLButtonElement>();
  const isEmpty = value.length === 0;

  return (
    <div className={oldStyle ? "input-search old-style" : "input-search"}>
      <input
        className={
          isEmpty
            ? "input-search-input is-empty"
            : "input-search-input is-not-empty"
        }
        type="text"
        value={value}
        placeholder=" "
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      />
      <KIcon name="search" className="input-search-part input-search-icon" />
      {isEmpty ? (
        <span className="input-search-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      ) : (
        <button
          ref={clearRipple.ref}
          type="button"
          className="btn-icon input-search-part input-search-button input-search-clear"
          aria-label={t("sidebar.clearSearch")}
          onClick={() => onChange("")}
        >
          <KIcon name="close" className="button-icon" />
        </button>
      )}
    </div>
  );
}
