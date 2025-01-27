import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '../sites/sites.entity';
import { DataUploadsController } from './data-uploads.controller';
import { DataUploads } from './data-uploads.entity';
import { DataUploadsService } from './data-uploads.service';

@Module({
  imports: [TypeOrmModule.forFeature([DataUploads, Site])],
  controllers: [DataUploadsController],
  providers: [DataUploadsService],
})
export class DataUploadsModule {}
