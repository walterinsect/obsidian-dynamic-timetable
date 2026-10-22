import React from 'react';
import { formatBufferTime } from '../../core/timetable';

export const BufferTimeRow = ({ bufferTime }: { bufferTime: number | null }) => (
  <tr className="buffer-time dt-buffer-time">
    <td>Buffer Time</td>
    <td colSpan={3} style={{ textAlign: 'center' }}>
      {formatBufferTime(bufferTime)}
    </td>
  </tr>
);
