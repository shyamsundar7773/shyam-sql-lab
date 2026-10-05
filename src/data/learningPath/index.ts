import approvedContentData from './content/approved-content.generated.json';
import legacyContentData from './content/legacy-content.json';
import taxonomyData from './taxonomy.json';
import {
  buildLearningCategories,
  type ApprovedSubtopicContent,
  type LearningPathTaxonomy,
  type LegacyLearningContent,
} from './build-curriculum';

export const learningPathTaxonomy = taxonomyData as LearningPathTaxonomy;

export const learningPathContent = approvedContentData as {
  version: number;
  entries: ApprovedSubtopicContent[];
};

export const legacyLearningContent = legacyContentData as LegacyLearningContent;

export const learningCategories = buildLearningCategories(
  learningPathTaxonomy,
  legacyLearningContent,
  learningPathContent.entries,
);
