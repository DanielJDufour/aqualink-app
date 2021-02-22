import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReefPointOfInterest } from '../reef-pois/reef-pois.entity';
import { Reef } from '../reefs/reefs.entity';
import { Sources } from '../reefs/sources.entity';
import { Metrics } from './metrics.entity';

@Entity()
export class TimeSeries {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  timestamp: Date;

  @Column({ type: 'float' })
  value: number;

  @ManyToOne(() => Reef, { onDelete: 'CASCADE' })
  reef: Reef;

  @ManyToOne(() => ReefPointOfInterest, { onDelete: 'CASCADE' })
  poi: ReefPointOfInterest;

  @ManyToOne(() => Metrics, { onDelete: 'SET NULL', nullable: true })
  metric: Metrics;

  @ManyToOne(() => Sources, { onDelete: 'SET NULL', nullable: true })
  source: Sources;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}