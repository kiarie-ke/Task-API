import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SavedViewEntity } from '../database/entities/platform.entity';
import { SavedViewFiltersDto } from './dto/create-saved-view.dto';

@Injectable()
export class SavedViewsService {
    constructor(private readonly dataSource: DataSource) {}

    list(userId: number) {
        return this.dataSource
            .getRepository(SavedViewEntity)
            .find({ where: { userId }, order: { id: 'ASC' } });
    }

    create(userId: number, name: string, filters: SavedViewFiltersDto) {
        return this.dataSource.getRepository(SavedViewEntity).save({
            userId,
            name: name.trim(),
            filters,
            createdAt: new Date().toISOString(),
        });
    }

    async remove(id: number, userId: number): Promise<void> {
        const repository = this.dataSource.getRepository(SavedViewEntity);
        const view = await repository.findOneBy({ id, userId });
        if (!view) {
            throw new NotFoundException('Saved view not found');
        }
        await repository.remove(view);
    }
}
