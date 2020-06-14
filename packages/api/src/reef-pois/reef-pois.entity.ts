import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Reef } from '../reefs/reefs.entity';

@Entity()
export class ReefPointOfInterest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  poiLabelId: number;

  @Column()
  imageUrl: string;

  @Column({ length: 50 })
  name: string;

  @ManyToOne(() => Reef, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reef_id' })
  reefId: Reef;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}