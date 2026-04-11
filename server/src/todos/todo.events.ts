export class TodoCreatedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
  ) {}
}

export class TodoUpdatedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly changedFields: string[],
  ) {}
}

export class TodoDeletedEvent {
  constructor(
    public readonly todo: any,   // snapshot taken before deletion
    public readonly callerId: string,
  ) {}
}

export class TodoMovedEvent {
  constructor(
    public readonly todo: any,              // snapshot taken before the move
    public readonly callerId: string,
    public readonly fromProjectId: string | null,
    public readonly toProjectId: string | null,
  ) {}
}

export class TodoFlowChangedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly stepLabel: string,
    public readonly isCompleted: boolean,
    public readonly isUndone: boolean,
  ) {}
}

export class TodoUserAssignedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly targetUserId: string,
  ) {}
}

export class TodoTeamAssignedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly teamId: string,
  ) {}
}

export class TodoUserUnassignedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly targetUserId: string,
  ) {}
}

export class TodoTeamUnassignedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly teamId: string,
  ) {}
}

export class CommentCreatedEvent {
  constructor(
    public readonly todo: any,
    public readonly callerId: string,
    public readonly authorName: string,
    public readonly body: string,
  ) {}
}
