import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

@Module({
    imports: [DatabaseModule],
    controllers: [SavedViewsController],
    providers: [SavedViewsService],
})
export class SavedViewsModule {}
