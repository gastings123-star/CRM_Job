import type { ManagementState } from '@/data/management';
export interface FollowUp {
  title: string;
  due: string;
  assignee: string;
  existingId: string;
}
export interface MeetingInput {
  id: string;
  title: string;
  date: string;
  decision: string;
  participants: string;
  sourceActionId: string;
  closeSource: boolean;
  followUps: FollowUp[];
}
/** One Management OS save stores the decision and its links together. */
export function recordMeeting(
  state: ManagementState,
  input: MeetingInput,
  makeId: () => string,
): ManagementState {
  if (!input.title.trim() || !input.decision.trim() || !input.date)
    throw new Error('Укажите тему, дату и принятое решение.');
  if (state.meetingNotes?.some((m) => m.id === input.id))
    throw new Error('Этот итог уже сохранён.');
  const next = structuredClone(state),
    actionIds: string[] = [];
  for (const follow of input.followUps) {
    if (follow.existingId) {
      if (!next.actions.some((a) => a.id === follow.existingId))
        throw new Error('Связанное действие не найдено.');
      if (actionIds.includes(follow.existingId)) throw new Error('Одно действие выбрано дважды.');
      actionIds.push(follow.existingId);
    } else {
      if (!follow.title.trim() || !follow.due) throw new Error('Укажите действие и дату контроля.');
      const id = makeId();
      next.actions.push({
        id,
        title: follow.title.trim(),
        due: follow.due,
        type: follow.assignee.trim() ? 'ПОРУЧЕНИЕ' : 'СВОЯ',
        assignee: follow.assignee.trim(),
        employeeId: '',
        teamId: '',
        source: '',
        status: 'OPEN',
        meetingId: input.id,
      });
      actionIds.push(id);
    }
  }
  if (input.sourceActionId) {
    const source = next.actions.find((a) => a.id === input.sourceActionId);
    if (!source) throw new Error('Исходная запись встречи не найдена.');
    if (input.closeSource) source.status = 'DONE';
  } else if (input.closeSource) throw new Error('Сначала выберите исходное действие о встрече.');
  next.meetingNotes = [
    ...(next.meetingNotes ?? []),
    {
      id: input.id,
      title: input.title.trim(),
      date: input.date,
      decision: input.decision.trim(),
      participants: input.participants.trim(),
      sourceActionId: input.sourceActionId,
      actionIds,
    },
  ];
  return next;
}
