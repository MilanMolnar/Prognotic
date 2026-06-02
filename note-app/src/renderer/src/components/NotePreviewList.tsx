import { ComponentProps } from 'react';
import { notesMock } from '@renderer/store/mocks';
import { NotePreview } from './NotePreview';

export const NotePreviewList = ({...props}: ComponentProps<'ul'>) => {
    if (notesMock.length === 0) {
        return (
            <div className="text-sm text-center text-zinc-500 mt-5"> 
               Only the best notes here! 
            </div>
        )
    }

  return (
    <ul {...props}>
      {notesMock.map((note) => (
        <li key={note.title}>
          <NotePreview key={note.title + note.lastEditTime} {...note} />
        </li>
      ))}
    </ul>
  );        
};