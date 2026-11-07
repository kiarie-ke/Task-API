import { Injectable } from '@nestjs/common';

@Injectable()
export class TasksService {
    private tasks: any[] = [];

    create(dto: any) {
        this.tasks.push(dto);
        return dto;
    }
}