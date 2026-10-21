import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { BUTTON_CLASS, FIELD_CLASS } from './options';
import { deleteMap, duplicateMap, listMaps, renameMap, type LibraryEntry } from '../core/library';

interface MyMapsDialogProps {
  // Library entry of the map that is open
  currentId: string;
  autosave: boolean;
  onOpen: (entry: LibraryEntry) => void;
  onRenameOpenMap: (title: string) => void;
  onClose: () => void;
}

const titleOf = (entry: LibraryEntry) => entry.title || 'Untitled map';

function formatSize(chars: number): string {
  return chars < 1024 * 1024 ? `${Math.max(1, Math.round(chars / 1024))} KB` : `${(chars / 1024 / 1024).toFixed(1)} MB`;
}

const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// File > My Maps: open, rename, duplicate and delete the maps kept in this browser
export const MyMapsDialog: React.FC<MyMapsDialogProps> = ({ currentId, autosave, onOpen, onRenameOpenMap, onClose }) => {
  const [entries, setEntries] = useState(listMaps);
  const [selectedId, setSelectedId] = useState(() => entries.find((e) => e.id !== currentId)?.id ?? entries[0]?.id);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  const selected = entries.find((e) => e.id === selectedId);
  const isOpenMap = selected?.id === currentId;
  const refresh = () => setEntries(listMaps());
  const select = (id: string) => {
    setSelectedId(id);
    setConfirmingDelete(false);
    setError('');
  };

  const open = (entry: LibraryEntry) => {
    if (entry.id !== currentId) onOpen(entry);
    onClose();
  };

  const commitRename = (entry: LibraryEntry, title: string) => {
    setRenaming(null);
    title = title.trim();
    if (!title || title === entry.title) return;
    if (!renameMap(entry.id, title)) setError('Could not rename the map: browser storage is full or unavailable.');
    if (entry.id === currentId) onRenameOpenMap(title);
    refresh();
  };

  const duplicate = (entry: LibraryEntry) => {
    const copyId = duplicateMap(entry.id, `${titleOf(entry)} (copy)`);
    if (!copyId) {
      setError('Could not copy the map: browser storage is full or unavailable.');
      return;
    }
    refresh();
    select(copyId);
  };

  const remove = (entry: LibraryEntry) => {
    deleteMap(entry.id);
    const rest = listMaps();
    setEntries(rest);
    const index = entries.indexOf(entry);
    select((rest[index] ?? rest[index - 1])?.id ?? '');
  };

  // Up/Down move the selection, Enter opens it
  const handleListKey = (e: React.KeyboardEvent) => {
    if (renaming || !entries.length) return;
    const index = entries.findIndex((entry) => entry.id === selectedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = entries[Math.min(entries.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))];
      select(next.id);
      document.getElementById(`my-map-${next.id}`)?.focus();
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      open(selected);
    }
  };

  const used = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);

  return (
    <Dialog title="My Maps" onClose={onClose} wide>
      {entries.length === 0 ? (
        <p className="text-ui-muted">
          No maps are kept in this browser yet. {autosave ? 'Maps you draw, open or share appear here.' : ''}
        </p>
      ) : (
        <div className="flex gap-3">
          <div
            role="listbox"
            aria-label="Maps in this browser"
            onKeyDown={handleListKey}
            className="flex-1 min-w-0 h-72 overflow-y-auto bg-ui-field border border-ui-border"
          >
            {entries.map((entry) => {
              const isSelected = entry.id === selectedId;
              return (
                <div
                  key={entry.id}
                  id={`my-map-${entry.id}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => select(entry.id)}
                  onDoubleClick={() => open(entry)}
                  className={`px-2 py-1 cursor-default outline-none border-b border-ui-border/50 ${
                    isSelected ? 'bg-ui-accent text-white' : 'hover:bg-ui-sunken'
                  }`}
                >
                  {renaming === entry.id ? (
                    <input
                      autoFocus
                      aria-label="New name"
                      defaultValue={entry.title}
                      onFocus={(e) => e.target.select()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onBlur={(e) => commitRename(entry, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(entry, e.currentTarget.value);
                      }}
                      className={`${FIELD_CLASS} w-full`}
                    />
                  ) : (
                    <div className="truncate font-medium">{titleOf(entry)}</div>
                  )}
                  <div className={`text-xs ${isSelected ? 'text-white/85' : 'text-ui-muted'}`}>
                    {entry.id === currentId && 'Open now · '}
                    {formatDate(entry.updatedAt)}
                    {!entry.saved && ' · not saved to a file'}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex w-28 flex-col gap-2">
            <button
              disabled={!selected || isOpenMap}
              title={isOpenMap ? 'This map is open' : undefined}
              onClick={() => selected && open(selected)}
              className={BUTTON_CLASS}
            >
              Open
            </button>
            <button disabled={!selected} onClick={() => setRenaming(selectedId ?? null)} className={BUTTON_CLASS}>
              Rename
            </button>
            <button disabled={!selected} onClick={() => selected && duplicate(selected)} className={BUTTON_CLASS}>
              Duplicate
            </button>
            <button
              disabled={!selected || isOpenMap}
              title={isOpenMap ? 'The open map can’t be deleted' : undefined}
              onClick={() => setConfirmingDelete(true)}
              className={`${BUTTON_CLASS} text-ui-danger`}
            >
              Delete…
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && selected && (
        <div role="alert" className="flex items-center gap-2 border border-ui-danger/60 p-2">
          <span className="flex-1 leading-snug">
            Delete <strong>“{titleOf(selected)}”</strong> from this browser? This can’t be undone
            {selected.saved ? '; your .dndmap file is not affected.' : ', and it isn’t saved to a file.'}
          </span>
          <button onClick={() => setConfirmingDelete(false)} className={BUTTON_CLASS}>
            Cancel
          </button>
          <button
            onClick={() => {
              setConfirmingDelete(false);
              remove(selected);
            }}
            className={`${BUTTON_CLASS} text-ui-danger`}
          >
            Delete
          </button>
        </div>
      )}

      {error && <p className="text-ui-danger">{error}</p>}

      <p className="text-xs text-ui-muted leading-snug">
        {entries.length > 0 && `${entries.length} ${entries.length === 1 ? 'map' : 'maps'}, ${formatSize(used)}. `}
        {autosave
          ? 'The open map is saved here as you work. Browser storage can be cleared, so keep .dndmap files of maps that matter.'
          : 'Autosave is off, so changes to the open map are not kept here.'}
      </p>
    </Dialog>
  );
};
