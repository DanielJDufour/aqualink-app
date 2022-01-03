import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isNil, omit } from 'lodash';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Survey } from './surveys.entity';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { User } from '../users/users.entity';
import { CreateSurveyMediaDto } from './dto/create-survey-media.dto';
import { SurveyMedia, MediaType } from './survey-media.entity';
import { EditSurveyDto } from './dto/edit-survey.dto';
import { EditSurveyMediaDto } from './dto/edit-survey-media.dto';
import { GoogleCloudService } from '../google-cloud/google-cloud.service';
import { Site } from '../sites/sites.entity';
import { getFileFromURL } from '../utils/google-cloud.utils';

@Injectable()
export class SurveysService {
  private logger: Logger = new Logger(SurveysService.name);

  constructor(
    @InjectRepository(Survey)
    private surveyRepository: Repository<Survey>,

    @InjectRepository(SurveyMedia)
    private surveyMediaRepository: Repository<SurveyMedia>,

    @InjectRepository(Site)
    private siteRepository: Repository<Site>,

    public googleCloudService: GoogleCloudService,

    private scheduleRegistry: SchedulerRegistry,
  ) {}

  // Create a survey
  async create(
    createSurveyDto: CreateSurveyDto,
    user: User,
    siteId: number,
  ): Promise<Survey> {
    const site = await this.siteRepository.findOne(siteId);

    if (!site) {
      throw new NotFoundException(`Site with id ${siteId} was not found`);
    }

    const survey = await this.surveyRepository.save({
      user,
      site,
      ...createSurveyDto,
      comments: this.transformComments(createSurveyDto.comments),
    });

    return survey;
  }

  // Create a survey media (video or image)
  async createMedia(
    createSurveyMediaDto: CreateSurveyMediaDto,
    surveyId: number,
  ): Promise<SurveyMedia> {
    const survey = await this.surveyRepository.findOne(surveyId);
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} was not found`);
    }

    // Check if a featured media already exists for this survey
    const featuredMedia = await this.surveyMediaRepository.findOne({
      where: {
        featured: true,
        surveyId: survey,
      },
    });

    const newFeatured =
      featuredMedia &&
      createSurveyMediaDto.featured &&
      !createSurveyMediaDto.hidden;

    if (featuredMedia && newFeatured) {
      await this.surveyMediaRepository.update(featuredMedia.id, {
        featured: false,
      });
    }

    return this.surveyMediaRepository.save({
      ...createSurveyMediaDto,
      surveyPoint: { id: createSurveyMediaDto.surveyPointId },
      featured: newFeatured || (!featuredMedia && !createSurveyMediaDto.hidden),
      type: MediaType.Image,
      surveyId: survey,
      comments: this.transformComments(createSurveyMediaDto.comments),
    });
  }

  // Find all surveys related to a specific site.
  async find(siteId: number): Promise<Survey[]> {
    const surveyHistoryQuery = await this.surveyRepository
      .createQueryBuilder('survey')
      .leftJoinAndMapOne(
        'survey.latestDailyData',
        'daily_data',
        'data',
        'data.site_id = survey.site_id AND DATE(data.date) = DATE(survey.diveDate)',
      )
      .innerJoin('survey.user', 'users')
      .leftJoinAndSelect(
        'survey.featuredSurveyMedia',
        'featuredSurveyMedia',
        'featuredSurveyMedia.featured = True',
      )
      .leftJoinAndSelect('featuredSurveyMedia.surveyPoint', 'surveyPoint')
      .addSelect(['users.fullName', 'users.id'])
      .where('survey.site_id = :siteId', { siteId })
      .getMany();

    const surveyObservationsQuery = await this.surveyMediaRepository
      .createQueryBuilder('surveyMedia')
      .innerJoin(
        'surveyMedia.surveyId',
        'surveys',
        'surveys.site_id = :siteId',
        { siteId },
      )
      .groupBy('surveyMedia.surveyId, surveyMedia.observations')
      .select(['surveyMedia.surveyId', 'surveyMedia.observations'])
      .getRawMany();

    const surveyPointsQuery = await this.surveyMediaRepository
      .createQueryBuilder('surveyMedia')
      .innerJoin(
        'surveyMedia.surveyId',
        'surveys',
        'surveys.site_id = :siteId',
        { siteId },
      )
      .groupBy('surveyMedia.surveyId, surveyMedia.surveyPoint')
      .select([
        'surveyMedia.surveyId',
        'surveyMedia.surveyPoint',
        'array_agg(surveyMedia.url) surveyPoint_images',
      ])
      .getRawMany();

    const observationsGroupedBySurveyId = this.groupBySurveyId(
      surveyObservationsQuery,
      'surveyMedia_observations',
    );
    const surveyPointIdGroupedBySurveyId = this.groupBySurveyId(
      surveyPointsQuery,
      'survey_point_id',
    );

    const surveyImageGroupedBySurveyPointId = this.groupBySurveyId(
      surveyPointsQuery,
      'surveypoint_images',
      'survey_point_id',
    );

    return surveyHistoryQuery.map((survey) => {
      const surveyDailyData = survey.latestDailyData;
      return {
        id: survey.id,
        diveDate: survey.diveDate,
        comments: survey.comments,
        weatherConditions: survey.weatherConditions,
        user: survey.user,
        site: survey.site,
        siteId: survey.siteId,
        // If no logged temperature exists grab the latest daily temperature of the survey's date
        temperature:
          survey.temperature ||
          (surveyDailyData &&
            (surveyDailyData.avgBottomTemperature ||
              surveyDailyData.satelliteTemperature)),
        featuredSurveyMedia: survey.featuredSurveyMedia,
        observations: observationsGroupedBySurveyId[survey.id] || [],
        surveyPoints: surveyPointIdGroupedBySurveyId[survey.id] || [],
        surveyPointImage: surveyImageGroupedBySurveyPointId[survey.id] || [],
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
      };
    });
  }

  // Find one survey provided its id
  // Include its surveyMedia grouped by siteSurveyPoint
  async findOne(surveyId: number): Promise<Survey> {
    const surveyDetails = await this.surveyRepository
      .createQueryBuilder('survey')
      .innerJoinAndSelect('survey.surveyMedia', 'surveyMedia')
      .leftJoinAndSelect('surveyMedia.surveyPoint', 'surveyPoints')
      .where('survey.id = :surveyId', { surveyId })
      .andWhere('surveyMedia.hidden = False')
      .getOne();

    if (!surveyDetails) {
      throw new NotFoundException(`Survey with id ${surveyId} was not found`);
    }

    return surveyDetails;
  }

  async findMedia(surveyId: number): Promise<SurveyMedia[]> {
    return this.surveyMediaRepository
      .createQueryBuilder('surveyMedia')
      .leftJoinAndSelect('surveyMedia.surveyPoint', 'surveyPoint')
      .where('surveyMedia.surveyId = :surveyId', { surveyId })
      .getMany();
  }

  async update(
    editSurveyDto: EditSurveyDto,
    surveyId: number,
  ): Promise<Survey> {
    const result = await this.surveyRepository.update(surveyId, {
      ...editSurveyDto,
      comments: this.transformComments(editSurveyDto.comments),
    });

    if (!result.affected) {
      throw new NotFoundException(`Survey with id ${surveyId} was not found`);
    }
    const updated = await this.surveyRepository.findOne(surveyId);

    return updated!;
  }

  async updateMedia(
    editSurveyMediaDto: EditSurveyMediaDto,
    mediaId: number,
  ): Promise<SurveyMedia> {
    if (
      isNil(editSurveyMediaDto.featured) ||
      isNil(editSurveyMediaDto.hidden)
    ) {
      throw new BadRequestException(
        'Features and hidden flags must be provided',
      );
    }

    const surveyMedia = await this.surveyMediaRepository.findOne(mediaId);

    if (!surveyMedia) {
      throw new NotFoundException(
        `Survey media with id ${mediaId} was not found`,
      );
    }

    // Media changes from featured to not featured
    if (
      surveyMedia.featured &&
      (editSurveyMediaDto.hidden || !editSurveyMediaDto.featured)
    ) {
      await this.assignFeaturedMedia(surveyMedia.surveyId.id, mediaId);
    }

    // Media changes from not featured to featured
    if (
      !surveyMedia.featured &&
      !editSurveyMediaDto.hidden &&
      editSurveyMediaDto.featured
    ) {
      await this.surveyMediaRepository.update(
        {
          surveyId: surveyMedia.surveyId,
          featured: true,
        },
        { featured: false },
      );
    }

    const trimmedComments = this.transformComments(editSurveyMediaDto.comments);
    await this.surveyMediaRepository.update(mediaId, {
      ...omit(editSurveyMediaDto, 'surveyPointId'),
      ...(editSurveyMediaDto.surveyPointId
        ? { surveyPoint: { id: editSurveyMediaDto.surveyPointId } }
        : {}),
      featured: !editSurveyMediaDto.hidden && editSurveyMediaDto.featured,
      ...(trimmedComments ? { comments: trimmedComments } : {}),
    });

    const updated = await this.surveyMediaRepository.findOne(mediaId);

    return updated!;
  }

  async delete(surveyId: number): Promise<void> {
    const surveyMedia = await this.surveyMediaRepository.find({
      where: { surveyId },
    });

    await Promise.all(
      surveyMedia.map((media) => {
        const file = getFileFromURL(media.url);
        // We need to grab the path/to/file. So we split the url on "{GCS_BUCKET}/"
        return this.googleCloudService.deleteFile(file).catch(() => {
          this.logger.error(
            `Could not delete media ${media.url} of survey ${surveyId}.`,
          );
        });
      }),
    );

    const result = await this.surveyRepository.delete(surveyId);

    if (!result.affected) {
      throw new NotFoundException(`Survey with id ${surveyId} was not found`);
    }
  }

  async deleteMedia(mediaId: number): Promise<void> {
    const surveyMedia = await this.surveyMediaRepository.findOne(mediaId);

    if (!surveyMedia) {
      throw new NotFoundException(
        `Survey media with id ${mediaId} was not found`,
      );
    }

    if (surveyMedia.featured) {
      await this.assignFeaturedMedia(surveyMedia.surveyId.id, mediaId);
    }

    // We need to grab the path/to/file. So we split the url on "{GCS_BUCKET}/"
    // and grab the second element of the resulting array which is the path we need
    await this.googleCloudService
      .deleteFile(getFileFromURL(surveyMedia.url))
      .catch((error) => {
        this.logger.error(
          `Could not delete media ${surveyMedia.url} of survey media ${mediaId}.`,
        );
        throw error;
      });

    await this.surveyMediaRepository.delete(mediaId);
  }

  /**
   * Assign a random survey media as the featured media of the survey,
   * because the current one will be unset.
   *
   * The new media should be not hidden.
   *
   * If no such media exists no featured media is assigned.
   *
   * @param surveyId The survey id
   * @param mediaId The media id that was previously featured and should be excluded
   */
  private async assignFeaturedMedia(surveyId: number, mediaId: number) {
    const surveyMedia = await this.surveyMediaRepository
      .createQueryBuilder('surveyMedia')
      .where('surveyMedia.surveyId = :surveyId ', { surveyId })
      .andWhere('id != :mediaId', { mediaId })
      .andWhere('hidden != True')
      .getOne();

    if (!surveyMedia) {
      return;
    }

    await this.surveyMediaRepository.update(surveyMedia.id, { featured: true });
  }

  /**
   * Transform all empty-like comments to null values to not have to deal with different types of empty comments
   *
   * @param comments The comments to transform
   */
  private transformComments(comments?: string) {
    if (comments === undefined) {
      return undefined;
    }

    const trimmedComments = comments.trim();
    return trimmedComments === '' ? undefined : trimmedComments;
  }

  /**
   * Group the values of the provided object array by the survey id and optionally by a secondary key
   *
   * @param object The object of arrays to perform the group (must have a survey id in each record)
   * @param key The key of the value you want to group
   * @param secondary The optional secondary key to perform a deeper group
   */
  private groupBySurveyId(object: any[], key: string, secondary?: string) {
    return object.reduce((result, current) => {
      return {
        ...result,
        [current.survey_id]: secondary
          ? { ...result[current.survey_id], [current[secondary]]: current[key] }
          : [...(result[current.survey_id] || []), current[key]],
      };
    }, {});
  }
}
